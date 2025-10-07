use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct EngineIOHandshakeResponse {
    #[serde(rename(deserialize = "sid"))]
    _sid: String,
    #[serde(rename(deserialize = "upgrades"))]
    _upgrades: Vec<String>,
    #[serde(rename(deserialize = "pingInterval"))]
    _ping_interval: usize,
    #[serde(rename(deserialize = "pingTimeout"))]
    _ping_timeout: usize,
    #[serde(rename(deserialize = "maxPayload"))]
    _max_payload: usize,
}

#[derive(Serialize)]
pub struct SocketIOHandshakeRequest {
    token: String,
}

impl SocketIOHandshakeRequest {
    pub fn new(token: &str) -> Self {
        Self {
            token: token.to_string(),
        }
    }
}

#[derive(Deserialize)]
pub struct SocketIOHandshakeResponse {
    #[serde(rename(deserialize = "sid"))]
    _sid: String,
}
