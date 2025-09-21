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
        events::{errors::EventError, websocketevents::WebSocketEvents},
    },
};

use super::ui::pages::Pages;

#[derive(Debug)]
pub enum FatalErrors {
    RenderingError,
}

impl Error for FatalErrors {}

impl Display for FatalErrors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RenderingError => write!(f, "Unable to render frame on screen"),
        }
    }
}

#[derive(Debug)]
pub struct App {
    auth_token: Option<String>,
    current_page: Pages,
    socket: Option<SocketIoClient>,
}

#[derive(Debug)]
enum ChannelEvents {
    LoginSuccess(String),
    LoginError(LoginErrors),
    RoomCreated((SocketIoClient, String)),
    RoomJoined(SocketIoClient),
    RoomJoinError(EventError),
}

impl App {
    pub fn new() -> Self {
        Self {
            auth_token: None,
            current_page: Pages::Login(LoginPage::new()),
            socket: None,
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
                              Some(PageResults::Login((email, password))) => {
                                let email = email.clone();
                                let password = password.clone();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                    match auth::login(&email, &password).await {
                                        Ok(response) => tx.send(ChannelEvents::LoginSuccess(response.token)).await.unwrap(),
                                        Err(loginerror) => tx.send(ChannelEvents::LoginError(loginerror)).await.unwrap(),
                                    }
                                });
                              },
                              Some(PageResults::GameModeChosen(mode)) => {
                                match (mode, self.auth_token.as_ref()) {
                                    (GameModes::CreateRoom, Some(token)) => {
                                        let token = token.clone();
                                        let tx = tx.clone();
                                        tokio::spawn(async move {
                                            match create_join_room(&token, None).await {
                                                Ok((client, Some(room_id))) => tx.send(ChannelEvents::RoomCreated((client, room_id))).await.unwrap(),
                                                Ok((_, None)) => panic!("create_join_room returned no room_id after creating a room"),
                                                Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                            }
                                        });
                                    },
                                    (GameModes::JoinRoom, _) => self.current_page = Pages::JoinRoom(JoinRoomPage::new()),
                                    (_, _) => (),
                                }
                              },
                              Some(PageResults::BackToMenu) | Some(PageResults::GameOver) => {
                                  self.abort_game().await;
                              },
                              Some(PageResults::JoinRoom(room_id)) => {
                                let room_id = room_id.clone();
                                let auth_token = self.auth_token.clone();
                                let tx = tx.clone();
                                tokio::spawn(async move {
                                    if let Some(token) = auth_token.as_ref() {
                                        match create_join_room(token, Some(room_id)).await {
                                            Ok((client, _)) => tx.send(ChannelEvents::RoomJoined(client)).await.unwrap(),
                                            Err(error) => tx.send(ChannelEvents::RoomJoinError(error)).await.unwrap(),
                                        }
                                    }
                                });
                              },
                              Some(PageResults::UpdatePaddleMovement(paddle_directions)) => {
                                  if let Some(socket) = self.socket.as_mut() {
                                      socket.paddle_move(paddle_directions).await.unwrap();
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
                        (ChannelEvents::LoginSuccess(token), Pages::Login(_)) => {
                            self.auth_token = Some(token);
                            self.current_page = Pages::GameModeSelector(GameModePage::new());
                        }
                        (ChannelEvents::LoginError(error), Pages::Login(page)) => {
                            page.login_error(&error);
                        },
                        (ChannelEvents::RoomCreated((client, room_id)), Pages::GameModeSelector(_)) => {
                            self.socket = Some(client);
                            self.current_page = Pages::GameLobby(GameLobbyPage::new(room_id));
                        },
                        (ChannelEvents::RoomJoined(client), Pages::JoinRoom(_)) => {
                            self.socket = Some(client);
                        },
                        (ChannelEvents::RoomJoinError(error), Pages::JoinRoom(page)) => {
                            page.join_error(&error);
                        }
                        (_, _) => (),
                    }
                }

                _ = interval.tick() => {
                    if let (Pages::Game(game), Some(socket)) = (&mut self.current_page, self.socket.as_mut()) {
                      game.tick(socket).await;
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

async fn create_join_room(
    token: &str,
    room_id: Option<String>,
) -> Result<(SocketIoClient, Option<String>), EventError> {
    let mut socket = SocketIoClient::new(
        "ws://localhost:3000/socket.io/?EIO=4&transport=websocket",
        token,
    )
    .await
    .map_err(|_| EventError::ConnectionError)?;

    let room_id = match room_id {
        Some(room_id) => {
            socket.join_room(room_id).await?;
            None
        }
        None => Some(socket.create_room().await?),
    };
    Ok((socket, room_id))
}
