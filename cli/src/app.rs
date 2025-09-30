use std::{error::Error, fmt::Display, time::Duration};

use futures_util::{FutureExt, StreamExt, future};
use ratatui::DefaultTerminal;
use tokio::{
    select,
    sync::mpsc::{self},
    time,
};

use crate::{
    auth::{self, LoginErrors},
    ui::{
        game::Game,
        game_lobby::GameLobbyPage,
        game_over::GameOverPage,
        gamemode::{GameModePage, GameModes},
        join_room::JoinRoomPage,
        login::LoginPage,
        pages::PageResults,
    },
    websocket::{
        SocketIoClient,
        events::{
            errors::EventError, request::CreateRoomRequest, websocketevents::WebSocketEvents,
        },
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
pub struct App {
    host: Option<String>,
    auth_token: Option<String>,
    current_page: Pages,
    socket: Option<SocketIoClient>,
    kitty_protocol_support: bool,
}

#[derive(Debug)]
enum ChannelEvents {
    LoginSuccess((String, String)),
    LoginError(LoginErrors),
    RoomCreated((SocketIoClient, String)),
    RoomJoined(SocketIoClient),
    RoomJoinError(EventError),
}

impl App {
    pub fn new(kitty_protocol_support: bool) -> Self {
        Self {
            host: None,
            auth_token: None,
            current_page: Pages::Login(LoginPage::new()),
            socket: None,
            kitty_protocol_support,
        }
    }

    async fn wait_for_events(&mut self) -> Result<WebSocketEvents, EventError> {
        match self.socket.as_mut() {
            Some(socket) => socket.wait_for_events().await,
            None => future::pending().await,
        }
    }

    pub async fn run(mut self, terminal: &mut DefaultTerminal) -> Result<(), FatalErrors> {
        let mut reader = crossterm::event::EventStream::new();
        let mut interval = time::interval(Duration::from_micros(1_000_000 / 60));
        let (tx, mut rx) = mpsc::channel(8);

        loop {
            select! {
                event = self.wait_for_events() => {
                    match (event, &mut self.current_page) {
                        (Ok(WebSocketEvents::GameStart(gamestartevent)), _) => {
                            self.current_page = Pages::Game(Game::new(gamestartevent, &terminal.get_frame()));
                        },
                        (Ok(WebSocketEvents::GameState(gamestateevent)), Pages::Game(game)) => {
                            game.update(&gamestateevent);
                        },
                        (Ok(WebSocketEvents::GameOver(gameoverevent)), Pages::Game(game)) => {
                            let result = game.game_over(&gameoverevent);
                            self.current_page = Pages::GameOver(GameOverPage::new(result));
                        },
                        (Ok(WebSocketEvents::GameAborted(_)), _) => self.abort_game().await,
                        (Ok(_), _) => (),
                        (Err(err), _) => {
                            // TODO: Show some error message (maybe create a separate page)
                            println!("{:?}", err);
                            self.socket = None;
                        },
                    }
                }

                Some(Ok(event)) = reader.next().fuse() => {
                    match event {
                      crossterm::event::Event::Key(_) => {
                          match self.current_page.key_event(&event) {
                              Some(PageResults::Login((host, email, password))) => {
                                let host = host.clone();
                                let email = email.clone();
                                let password = password.clone();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                    match auth::login(&host, &email, &password).await {
                                        Ok(response) => tx.send(ChannelEvents::LoginSuccess((host, response.token))).await.unwrap(),
                                        Err(loginerror) => tx.send(ChannelEvents::LoginError(loginerror)).await.unwrap(),
                                    }
                                });
                              },
                              Some(PageResults::GameModeChosen(mode)) => {
                                match (mode, self.host.as_ref(), self.auth_token.as_ref()) {
                                    (GameModes::SinglePlayer, Some(host), Some(token)) => {
                                        let host = host.clone();
                                        let token = token.clone();
                                        let tx = tx.clone();
                                        tokio::spawn(async move {
                                            match create_singleplayer_game(&get_endpoint(&host), &token).await {
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
                                            match create_join_room(&get_endpoint(&host), &token, None).await {
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
                                        match create_join_room(&get_endpoint(host), token, Some(room_id)).await {
                                            Ok((client, _)) => tx.send(ChannelEvents::RoomJoined(client)).await.unwrap(),
                                            Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                        }
                                    }
                                });
                              },
                              Some(PageResults::UpdatePaddleMovement(paddle_directions)) => {
                                  if let Some(socket) = self.socket.as_mut() {
                                    if socket.paddle_move(paddle_directions).await.is_err() {
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
                        (ChannelEvents::LoginSuccess((host, token)), Pages::Login(_)) => {
                            self.auth_token = Some(token);
                            self.host = Some(host);
                            self.current_page = Pages::GameModeSelector(GameModePage::new());
                        }
                        (ChannelEvents::LoginError(error), Pages::Login(page)) => {
                            page.login_error(&error);
                        },
                        (ChannelEvents::RoomCreated((client, room_id)), Pages::GameModeSelector(_)) => {
                            self.socket = Some(client);
                            self.current_page = Pages::GameLobby(GameLobbyPage::new(room_id));
                        },
                        (ChannelEvents::RoomJoined(client), _) => {
                            self.socket = Some(client);
                        },
                        (ChannelEvents::RoomJoinError(error), Pages::JoinRoom(page)) => {
                            page.join_error(&error);
                        }
                        (_, _) => (),
                    }
                }

                _ = interval.tick() => {
                    if let (false, Pages::Game(game), Some(socket)) = (self.kitty_protocol_support, &mut self.current_page, self.socket.as_mut()) {
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
        if let Some(socket) = self.socket.as_mut() {
            socket.close().await.ok();
        }
        self.socket = None;
        self.current_page = Pages::GameModeSelector(GameModePage::new());
    }
}

fn get_endpoint(host: &str) -> String {
    if cfg!(debug_assertions) {
        format!("ws://{}:3000/socket.io/?EIO=4&transport=websocket", host)
    } else {
        format!("wss://{}:8443/socket.io/?EIO=4&transport=websocket", host)
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
