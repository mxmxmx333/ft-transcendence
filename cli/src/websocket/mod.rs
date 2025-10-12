mod errors;
pub mod events;
mod handshake;

use std::error::Error;

use errors::WebSocketErrors;
use events::{
    errors::EventError,
    request::{CreateRoomRequest, EventRequest, EventTypes, PaddleMoveDirection},
    response::EventResponse,
    websocketevents::{CreateRoomEvent, SocketEvents},
};
use futures_util::{SinkExt, StreamExt};
use handshake::{EngineIOHandshakeResponse, SocketIOHandshakeRequest, SocketIOHandshakeResponse};
use http::Uri;
use native_tls::TlsConnector;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    Connector::NativeTls,
    MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
    tungstenite::{Message, Utf8Bytes},
};

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug)]
pub struct SocketIoClient {
    socket: WsStream,
}

impl SocketIoClient {
    pub async fn new(url: &str, token: &str) -> Result<Self, WebSocketErrors> {
        let url: Uri = url.parse().map_err(|_| WebSocketErrors::UrlParsingError)?;

        let connector = TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|err| WebSocketErrors::Unknown(err.to_string()))?;

        let (mut socket, _) =
            connect_async_tls_with_config(url, None, false, Some(NativeTls(connector)))
                .await
                .map_err(|_| WebSocketErrors::ConnectionError)?;

        Self::engineio_handshake(&mut socket)
            .await
            .map_err(|_| WebSocketErrors::HandshakeError)?;

        Self::socketio_handshake(&mut socket, token)
            .await
            .map_err(|err| {
                err.downcast::<WebSocketErrors>()
                    .map(|err| *err)
                    .unwrap_or(WebSocketErrors::HandshakeError)
            })?;

        Ok(Self { socket })
    }

    async fn engineio_handshake(socket: &mut WsStream) -> Result<(), Box<dyn Error>> {
        let msg = socket.next().await.ok_or(WebSocketErrors::HandshakeError)?;

        match msg? {
            Message::Text(text) => {
                let json = Self::split_code_json(&text)
                    .and_then(|(code, json)| if code == 0 { Some(json) } else { None })
                    .ok_or(WebSocketErrors::HandshakeError)?;

                let _handshake: EngineIOHandshakeResponse = serde_json::from_str(&json)?;

                Ok(())
            }
            _ => Err(Box::new(WebSocketErrors::HandshakeError)),
        }
    }

    async fn socketio_handshake(socket: &mut WsStream, token: &str) -> Result<(), Box<dyn Error>> {
        let body = format!(
            "40{}",
            serde_json::to_string(&SocketIOHandshakeRequest::new(token))?
        );

        socket.send(Message::Text(body.into())).await?;

        let msg = socket.next().await.ok_or(WebSocketErrors::HandshakeError)?;

        match msg? {
            Message::Text(text) => {
                let (code, json) =
                    Self::split_code_json(&text).ok_or(WebSocketErrors::HandshakeError)?;

                if code == 44 {
                    return Err(Box::new(WebSocketErrors::InvalidCredentials));
                } else if code != 40 {
                    return Err(Box::new(WebSocketErrors::HandshakeError));
                }

                let _handshake: SocketIOHandshakeResponse = serde_json::from_str(&json)?;

                Ok(())
            }
            _ => Err(Box::new(WebSocketErrors::HandshakeError)),
        }
    }

    fn split_code_json(response: &Utf8Bytes) -> Option<(usize, String)> {
        let pos = response.find(['{', '['])?;

        if pos == 0 {
            return None;
        }

        let code = response[0..pos].parse::<usize>().ok()?;
        let json = response[pos..].to_string();

        Some((code, json))
    }

    async fn send_event(&mut self, event: &EventRequest) -> Result<EventResponse, EventError> {
        let data = format!(
            "42{}",
            serde_json::to_string(event).map_err(EventError::SerializingError)?
        );

        self.socket
            .send(Message::Text(data.into()))
            .await
            .map_err(|_| EventError::ConnectionError)?;

        let msg = self
            .socket
            .next()
            .await
            .ok_or(EventError::ConnectionError)?
            .map_err(|_| EventError::ConnectionError);

        match msg? {
            Message::Text(text) => {
                let (code, json) =
                    Self::split_code_json(&text).ok_or(EventError::ConnectionError)?;

                if code != 42 {
                    println!("{}", text);
                    return Err(EventError::InvalidResponse);
                }

                let parsed: EventResponse =
                    serde_json::from_str(&json).map_err(EventError::SerializingError)?;

                Ok(parsed)
            }
            _ => Err(EventError::ConnectionError),
        }
    }

    async fn send_event_noresponse(&mut self, event: &EventRequest) -> Result<(), EventError> {
        let data = format!(
            "42{}",
            serde_json::to_string(event).map_err(EventError::SerializingError)?
        );

        self.socket
            .send(Message::Text(data.into()))
            .await
            .map_err(|_| EventError::ConnectionError)?;

        Ok(())
    }

    pub async fn create_room(
        &mut self,
        room_type: CreateRoomRequest,
    ) -> Result<String, EventError> {
        let response = self
            .send_event(&EventRequest::new(
                "create_room",
                &EventTypes::CreateRoom(room_type),
            ))
            .await?;

        match response.get_type() {
            "room_created" => {
                let parsed: CreateRoomEvent = serde_json::from_value(response.get_value().clone())
                    .map_err(EventError::SerializingError)?;

                if !parsed.success {
                    return Err(EventError::InvalidResponse);
                }

                Ok(parsed.room_id)
            }
            "create_error" => Err(EventError::CreateRoomError),
            _ => {
                eprintln!("Unexpected Response: {:?}", response);
                Err(EventError::InvalidResponse)
            }
        }
    }

    pub async fn join_room(&mut self, room_id: String) -> Result<(), EventError> {
        let response = self
            .send_event(&EventRequest::new(
                "join_room",
                &EventTypes::JoinRoom { room_id },
            ))
            .await?;

        match response.get_type() {
            "joined_room" => Ok(()),
            "join_error" => Err(EventError::JoinRoomError),
            _ => {
                eprintln!("Unexpected Response: {:?}", response);
                Err(EventError::InvalidResponse)
            }
        }
    }

    pub async fn paddle_move(
        &mut self,
        directions: (PaddleMoveDirection, PaddleMoveDirection),
    ) -> Result<(), EventError> {
        self.send_event_noresponse(&EventRequest::new(
            "paddle_move",
            &EventTypes::PaddleMove {
                move_p1: directions.0,
                move_p2: directions.1,
            },
        ))
        .await
    }

    pub async fn pause_game(&mut self, is_paused: bool) -> Result<(), EventError> {
        self.send_event_noresponse(&EventRequest::new(
            "game_pause",
            &EventTypes::GamePause(is_paused),
        ))
        .await
    }

    pub async fn close(&mut self) -> Result<(), EventError> {
        self.socket
            .close(None)
            .await
            .map_err(|_| EventError::ConnectionError)
    }

    pub async fn wait_for_events(&mut self) -> Result<SocketEvents, EventError> {
        let msg = self
            .socket
            .next()
            .await
            .ok_or(EventError::ConnectionError)?
            .map_err(|_| EventError::ConnectionError)?;

        match msg {
            Message::Text(text) => {
                if text == "2" {
                    self.socket
                        .send("3".into())
                        .await
                        .map_err(|_| EventError::ConnectionError)?;

                    return Ok(SocketEvents::Ping);
                }
                let (_code, json) =
                    Self::split_code_json(&text).ok_or(EventError::InvalidResponse)?;

                let parsed: EventResponse =
                    serde_json::from_str(&json).map_err(EventError::SerializingError)?;

                match parsed.get_type() {
                    "joined_room" => Ok(SocketEvents::JoinedRoom(
                        serde_json::from_value(parsed.get_value().clone())
                            .map_err(EventError::SerializingError)?,
                    )),
                    "game_start" => Ok(SocketEvents::GameStart(
                        serde_json::from_value(parsed.get_value().clone())
                            .map_err(EventError::SerializingError)?,
                    )),
                    "game_state" => Ok(SocketEvents::GameState(
                        serde_json::from_value(parsed.get_value().clone())
                            .map_err(EventError::SerializingError)?,
                    )),
                    "game_pause_state" => Ok(SocketEvents::GamePauseState(
                      serde_json::from_value(parsed.get_value().clone())
                        .map_err(EventError::SerializingError)?,
                    )),
                    "game_aborted" => Ok(SocketEvents::GameAborted(
                        serde_json::from_value(parsed.get_value().clone())
                            .map_err(EventError::SerializingError)?,
                    )),
                    "game_over" => Ok(SocketEvents::GameOver(
                        serde_json::from_value(parsed.get_value().clone())
                            .map_err(EventError::SerializingError)?,
                    )),
                    _ => {
                        println!("Unknown event: {}", parsed.get_type());
                        Err(EventError::InvalidResponse)
                    }
                }
            }
            _ => {
                println!("{:?}", msg);
                Err(EventError::InvalidResponse)
            }
        }
    }
}
