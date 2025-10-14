use std::{collections::HashMap, error::Error, fmt::Display, net::SocketAddr, time::Duration};

use futures_util::{FutureExt, StreamExt, future};
use http::{Response, StatusCode};
use http_body_util::Full;
use hyper::{Request, body::Bytes, server::conn::http1, service::service_fn};
use hyper_util::rt::TokioIo;
use ratatui::DefaultTerminal;
use tokio::{
    net::TcpListener,
    select,
    sync::mpsc::{self, Sender},
    time,
};

use crate::{
    auth::{self, BoolOrString, LoginErrors, TotpErrors},
    ui::{
        game::Game,
        game_lobby::GameLobbyPage,
        game_over::GameOverPage,
        gamemode::{GameModePage, GameModes},
        host_selector::HostSelectorPage,
        join_room::JoinRoomPage,
        login::LoginPage,
        nickname_page::NicknamePage,
        pages::{LoginType, PageResults},
        totp::TotpPage,
    },
    websocket::{
        SocketIoClient,
        events::{errors::EventError, request::CreateRoomRequest, websocketevents::SocketEvents},
    },
};

use super::ui::pages::Pages;

#[derive(Debug)]
pub enum FatalErrors {
    RenderingError,
    KeyboardEnhancementFlagsError(std::io::Error),
}

impl Error for FatalErrors {}

impl Display for FatalErrors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RenderingError => write!(f, "Unable to render frame on screen"),
            Self::KeyboardEnhancementFlagsError(err) => {
                write!(
                    f,
                    "Unable to query or toggle keyboard enhancement flags: {}",
                    err
                )
            }
        }
    }
}

#[derive(Debug)]
enum WsOrWeb {
    Websocket(SocketIoClient),
    Webserver(TcpListener),
}

#[derive(Debug)]
pub struct App {
    host: Option<String>,
    auth_token: Option<String>,
    current_page: Pages,
    socket: Option<WsOrWeb>,
    kitty_protocol_support: bool,
}

#[derive(Debug)]
enum ChannelEvents {
    LoginSuccess((String, String)),
    LoginError(LoginErrors),
    NicknameError(LoginErrors),
    TotpRequired((String, String)),
    TotpSuccess(String),
    TotpError(TotpErrors),
    RemoteRedirect(String),
    RemoteRedirectCallback((String, bool)),
    RemoteRedirectError(LoginErrors),
    RoomCreated((SocketIoClient, String)),
    RoomJoined(SocketIoClient),
    RoomJoinError(EventError),
}

async fn wait_for_webserver_events(
    server: &mut TcpListener,
    tx: &Sender<ChannelEvents>,
) -> Result<SocketEvents, EventError> {
    let (stream, _) = match server.accept().await {
        Ok(conn) => conn,
        Err(_) => return Err(EventError::ConnectionError),
    };

    let service = service_fn(move |req: Request<hyper::body::Incoming>| {
        let tx = tx.clone();
        async move {
            let query = req.uri().query().unwrap_or("");
            let params: HashMap<_, _> = url::form_urlencoded::parse(query.as_bytes())
                .into_owned()
                .collect();

            let token = params.get("token");
            let nickname_required = params.get("nickname_required");

            match (token, nickname_required) {
                (Some(token), Some(nickname_required)) => {
                    let nickname_required = match nickname_required.as_str() {
                        "true" => true,
                        "false" => false,
                        _ => {
                            let response = Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Full::new(Bytes::from("Bad Request")))
                                .unwrap();
                            tx.send(ChannelEvents::RemoteRedirectError(
                                LoginErrors::InvalidResponse,
                            ))
                            .await
                            .unwrap();
                            return Ok::<_, hyper::Error>(response);
                        }
                    };
                    tx.send(ChannelEvents::RemoteRedirectCallback((
                        token.clone(),
                        nickname_required,
                    )))
                    .await
                    .unwrap();
                    let response = Response::builder()
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Full::new(Bytes::from("LGTM")))
                        .unwrap();
                    Ok::<_, hyper::Error>(response)
                }
                (_, _) => {
                    let response = Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Full::new(Bytes::from("Bad Request")))
                        .unwrap();
                    tx.send(ChannelEvents::RemoteRedirectError(
                        LoginErrors::InvalidResponse,
                    ))
                    .await
                    .unwrap();
                    Ok::<_, hyper::Error>(response)
                }
            }
        }
    });

    let io = TokioIo::new(stream);

    http1::Builder::new()
        .serve_connection(io, service)
        .await
        .ok();

    Err(EventError::ConnectionError)
}

impl App {
    pub fn new(kitty_protocol_support: bool) -> Self {
        Self {
            host: None,
            auth_token: None,
            current_page: Pages::HostSelector(HostSelectorPage::new()),
            socket: None,
            kitty_protocol_support,
        }
    }

    async fn wait_for_socket_events(
        &mut self,
        tx: &Sender<ChannelEvents>,
    ) -> Result<SocketEvents, EventError> {
        match self.socket.as_mut() {
            Some(WsOrWeb::Websocket(socket)) => socket.wait_for_events().await,
            Some(WsOrWeb::Webserver(server)) => wait_for_webserver_events(server, tx).await,
            None => future::pending().await,
        }
    }

    pub async fn run(mut self, terminal: &mut DefaultTerminal) -> Result<(), FatalErrors> {
        let mut reader = crossterm::event::EventStream::new();
        let mut interval = time::interval(Duration::from_micros(1_000_000 / 60));
        let (tx, mut rx) = mpsc::channel(8);

        loop {
            select! {
                event = self.wait_for_socket_events(&tx) => {
                    match (event, &mut self.current_page) {
                        (Ok(SocketEvents::GameStart(gamestartevent)), _) => {
                            self.current_page = Pages::Game(Game::new(gamestartevent, &terminal.get_frame()));
                        },
                        (Ok(SocketEvents::GameState(gamestateevent)), Pages::Game(game)) => {
                            game.update(&gamestateevent);
                        },
                        (Ok(SocketEvents::GameOver(gameoverevent)), Pages::Game(game)) => {
                            let result = game.game_over(&gameoverevent);
                            self.current_page = Pages::GameOver(GameOverPage::new(result));
                        },
                        (Ok(SocketEvents::GameAborted(_)), _) => self.abort_game().await,
                        (Ok(SocketEvents::GamePauseState(is_paused)), Pages::Game(game)) => {
                          game.set_paused(is_paused);
                        },
                        (Ok(_), _) => (),
                        (Err(_), _) => {
                            self.socket = None;
                        },
                    }
                }

                Some(Ok(event)) = reader.next().fuse() => {
                    match event {
                      crossterm::event::Event::Key(key) => {
                          match self.current_page.key_event(&event, key.kind) {
                              Some(PageResults::HostSelected((host, login_type))) => {
                                self.host = Some(host.clone());
                                match login_type {
                                  LoginType::LocalLogin => {
                                    self.current_page = Pages::Login(LoginPage::new());
                                  },
                                  LoginType::RemoteLogin => {
                                    let addr: SocketAddr = ([127, 0, 0, 1], 0).into();
                                    let webserver = TcpListener::bind(addr).await;
                                    match webserver {
                                      Ok(webserver) => {
                                        let addr = webserver.local_addr();
                                        match addr {
                                          Ok(addr) => {
                                            let port = addr.port();
                                            let tx = tx.clone();
                                            self.socket = Some(WsOrWeb::Webserver(webserver));
                                            tokio::spawn(async move {
                                              match auth::remotelogin(&host, port).await {
                                                Ok(response) => tx.send(ChannelEvents::RemoteRedirect(response.url)).await.unwrap(),
                                                Err(err) => tx.send(ChannelEvents::RemoteRedirectError(err)).await.unwrap(),
                                              }
                                            });
                                          },
                                          Err(_) => tx.send(ChannelEvents::LoginError(LoginErrors::Unknown("Unable to fetch Port from local webserver".to_string()))).await.unwrap(),
                                        }
                                      }
                                      Err(_) => tx.send(ChannelEvents::LoginError(LoginErrors::Unknown("Unable to bind webserver".to_string()))).await.unwrap(),
                                    }
                                  },
                                }
                              },
                              Some(PageResults::NicknameSelected(nickname)) => {
                                let token = self.auth_token.clone().unwrap();
                                let host = self.host.clone().unwrap();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                  match auth::set_nickname(&host, &token, &nickname).await {
                                    Ok(response) => {
                                      match (response.success, response.token, response.error) {
                                        (true, Some(token), _) => tx.send(ChannelEvents::LoginSuccess((host, token))).await.unwrap(),
                                        (false, _, Some(error)) => tx.send(ChannelEvents::NicknameError(LoginErrors::Unknown(error))).await.unwrap(),
                                        (_, _, _) => tx.send(ChannelEvents::NicknameError(LoginErrors::Unknown("someone changed backend code ig".to_string()))).await.unwrap(),
                                      }
                                    },
                                    Err(loginerror) => tx.send(ChannelEvents::NicknameError(loginerror)).await.unwrap(),
                                  }
                                });
                              },
                              Some(PageResults::Login((email, password))) => {
                                let host = self.host.clone().unwrap();
                                let email = email.clone();
                                let password = password.clone();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                    match auth::login(&host, &email, &password).await {
                                        Ok(response) => {
                                          if let BoolOrString::Bool(false) = response.action_required {
                                            tx.send(ChannelEvents::LoginSuccess((host, response.token))).await.unwrap();
                                          } else {
                                            tx.send(ChannelEvents::TotpRequired((host, response.token))).await.unwrap();
                                          }
                                        },
                                        Err(loginerror) => tx.send(ChannelEvents::LoginError(loginerror)).await.unwrap(),
                                    }
                                });
                              },
                              Some(PageResults::Totp(totp_code)) => {
                                if let (Some(host), Some(auth_token)) = (&self.host, &self.auth_token) {
                                  let host = host.clone();
                                  let auth_token = auth_token.clone();
                                  let totp_code = totp_code.clone();
                                  let tx = tx.clone();
                                  tokio::spawn(async move {
                                    match auth::login2fa(&host, &auth_token, &totp_code).await {
                                      Ok(response) => tx.send(ChannelEvents::TotpSuccess(response.token)).await.unwrap(),
                                      Err(totperror) => tx.send(ChannelEvents::TotpError(totperror)).await.unwrap(),
                                    }
                                  });
                                }
                              },
                              Some(PageResults::GameModeChosen(mode)) => {
                                match (mode, self.host.as_ref(), self.auth_token.as_ref()) {
                                    (GameModes::SinglePlayer, Some(host), Some(token)) => {
                                        let host = host.clone();
                                        let token = token.clone();
                                        let tx = tx.clone();
                                        tokio::spawn(async move {
                                            match create_singleplayer_game(&get_endpoint(&host, &token), &token).await {
                                                Ok((client, _)) => tx.send(ChannelEvents::RoomJoined(client)).await.unwrap(),
                                                Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                            }
                                        });
                                    }
                                    (GameModes::CreateRoom, Some(host), Some(token)) => {
                                        let host = host.clone();
                                        let token = token.clone();
                                        let tx = tx.clone();
                                        tokio::spawn(async move {
                                            match create_join_room(&get_endpoint(&host, &token), &token, None).await {
                                                Ok((client, Some(room_id))) => tx.send(ChannelEvents::RoomCreated((client, room_id))).await.unwrap(),
                                                Ok((_, None)) => panic!("create_join_room returned no room_id after creating a room"),
                                                Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                            }
                                        });
                                    },
                                    (GameModes::JoinRoom, _, _) => self.current_page = Pages::JoinRoom(JoinRoomPage::new()),
                                    (_, _, _) => (),
                                }
                              },
                              Some(PageResults::BackToMenu) | Some(PageResults::GameOver) => {
                                  self.abort_game().await;
                              },
                              Some(PageResults::JoinRoom(room_id)) => {
                                let room_id = room_id.clone();
                                let host = self.host.clone();
                                let auth_token = self.auth_token.clone();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                    if let (Some(host), Some(token)) = (host.as_ref(), auth_token.as_ref()) {
                                        match create_join_room(&get_endpoint(host, &token), token, Some(room_id)).await {
                                            Ok((client, _)) => tx.send(ChannelEvents::RoomJoined(client)).await.unwrap(),
                                            Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                        }
                                    }
                                });
                              },
                              Some(PageResults::UpdatePaddleMovement(paddle_directions)) => {
                                  if let Some(WsOrWeb::Websocket(socket)) = self.socket.as_mut() {
                                    if socket.paddle_move(paddle_directions).await.is_err() {
                                        self.abort_game().await;
                                    }
                                  }
                              },
                              Some(PageResults::GamePaused(is_paused)) => {
                                  if let Some(WsOrWeb::Websocket(socket)) = self.socket.as_mut() {
                                    if socket.pause_game(is_paused).await.is_err() {
                                        self.abort_game().await;
                                    }
                                  }
                              },
                              Some(PageResults::Exit) => break Ok(()),
                              None => (),
                          }
                          self.render(terminal, false)?;
                      },
                      crossterm::event::Event::Resize(_, _) => self.render(terminal, true)?,
                      _ => (),
                    }
                  }

                Some(msg) = rx.recv() => {
                    match (msg, &mut self.current_page) {
                        (ChannelEvents::LoginSuccess((host, token)), _) => {
                            self.auth_token = Some(token);
                            self.host = Some(host);
                            self.current_page = Pages::GameModeSelector(GameModePage::new());
                        }
                        (ChannelEvents::TotpRequired((host, token)), _) => {
                          self.auth_token = Some(token);
                          self.host = Some(host);
                          self.current_page = Pages::TotpPage(TotpPage::new());
                        }
                        (ChannelEvents::TotpSuccess(token), _) => {
                          self.auth_token = Some(token);
                          self.current_page = Pages::GameModeSelector(GameModePage::new());
                        }
                        (ChannelEvents::TotpError(error), Pages::TotpPage(page)) => {
                          page.totp_error(&error);
                        }
                        (ChannelEvents::LoginError(error), Pages::Login(page)) => {
                            page.login_error(&error);
                        },
                        (ChannelEvents::NicknameError(error), Pages::NicknameSelector(page)) => {
                          page.nickname_error(&error);
                        },
                        (ChannelEvents::RemoteRedirect(url), Pages::HostSelector(page)) => {
                          if webbrowser::open(url.as_str()).is_err() {
                            page.host_error(&LoginErrors::Unknown("Unable to open webbrowser".to_string()));
                            self.socket = None;
                          }
                        },
                        (ChannelEvents::RemoteRedirectCallback((token, nickname_required)), Pages::HostSelector(_)) => {
                          self.auth_token = Some(token);
                          self.socket = None;
                          if nickname_required {
                            self.current_page = Pages::NicknameSelector(NicknamePage::new());
                          } else {
                            self.current_page = Pages::GameModeSelector(GameModePage::new());
                          }
                        },
                        (ChannelEvents::RemoteRedirectError(error), Pages::HostSelector(page)) => {
                          page.host_error(&error);
                          self.socket = None;
                        }
                        (ChannelEvents::RoomCreated((client, room_id)), Pages::GameModeSelector(_)) => {
                            self.socket = Some(WsOrWeb::Websocket(client));
                            self.current_page = Pages::GameLobby(GameLobbyPage::new(room_id));
                        },
                        (ChannelEvents::RoomJoined(client), _) => {
                            self.socket = Some(WsOrWeb::Websocket(client));
                        },
                        (ChannelEvents::RoomJoinError(error), Pages::JoinRoom(page)) => {
                            page.join_error(&error);
                        }
                        (_, _) => (),
                    }
                }

                _ = interval.tick() => {
                    if let (false, Pages::Game(game), Some(WsOrWeb::Websocket(socket))) = (self.kitty_protocol_support, &mut self.current_page, self.socket.as_mut()) {
                        if game.tick(socket).await.is_err() {
                            self.abort_game().await;
                        }
                    }
                    self.render(terminal, false)?;
                }
            }
        }
    }

    fn render(
        &mut self,
        terminal: &mut DefaultTerminal,
        force_redraw: bool,
    ) -> Result<(), FatalErrors> {
        if force_redraw || self.current_page.needs_update() {
            terminal
                .draw(|frame| self.current_page.render(frame))
                .map_err(|_| FatalErrors::RenderingError)?;
        }

        Ok(())
    }

    async fn abort_game(&mut self) {
        if let Some(WsOrWeb::Websocket(socket)) = self.socket.as_mut() {
            socket.close().await.ok();
        }
        self.socket = None;
        self.current_page = Pages::GameModeSelector(GameModePage::new());
    }
}

fn get_endpoint(host: &str, token: &str) -> String {
    if cfg!(debug_assertions) {
        format!(
            "wss://{}:3000/socket.io/?token={}&EIO=4&transport=websocket",
            host, token
        )
    } else {
        format!(
            "wss://{}:8443/socket.io/?token={}&EIO=4&transport=websocket",
            host, token
        )
    }
}

async fn create_join_room(
    endpoint: &str,
    token: &str,
    room_id: Option<String>,
) -> Result<(SocketIoClient, Option<String>), EventError> {
    let mut socket = SocketIoClient::new(endpoint, token)
        .await
        .map_err(|_| EventError::ConnectionError)?;

    let room_id = match room_id {
        Some(room_id) => {
            socket.join_room(room_id).await?;
            None
        }
        None => Some(socket.create_room(CreateRoomRequest::multiplayer()).await?),
    };
    Ok((socket, room_id))
}

async fn create_singleplayer_game(
    endpoint: &str,
    token: &str,
) -> Result<(SocketIoClient, Option<String>), EventError> {
    let mut socket = SocketIoClient::new(endpoint, token)
        .await
        .map_err(|_| EventError::ConnectionError)?;

    let room_id = socket
        .create_room(CreateRoomRequest::singleplayer())
        .await?;
    Ok((socket, Some(room_id)))
}
