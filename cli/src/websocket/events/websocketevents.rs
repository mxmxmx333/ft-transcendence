use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct JoinedRoomEvent {
    #[serde(rename(deserialize = "roomId"))]
    room_id: String,
    message: String,
    success: bool,
}

#[derive(Deserialize, Debug)]
pub struct CreateRoomEvent {
    #[serde(rename(deserialize = "roomId"))]
    pub room_id: String,
    pub success: bool,
}

#[derive(Deserialize, Debug)]
pub struct GameStartEvent {
    message: String,
    #[serde(rename(deserialize = "roomId"))]
    room_id: String,
    #[serde(rename(deserialize = "ballX"))]
    pub ball_x: f64,
    #[serde(rename(deserialize = "ballY"))]
    pub ball_y: f64,
    #[serde(rename(deserialize = "ballVX"))]
    _ball_vx: f64,
    #[serde(rename(deserialize = "ballVY"))]
    _ball_vy: f64,
    #[serde(rename(deserialize = "paddle1Y"))]
    pub paddle1_y: f64,
    #[serde(rename(deserialize = "paddle2Y"))]
    pub paddle2_y: f64,
    #[serde(rename(deserialize = "ownerScore"))]
    pub owner_score: usize,
    #[serde(rename(deserialize = "guestScore"))]
    pub guest_score: usize,
    pub owner: GameStartEventPlayer,
    pub guest: GameStartEventPlayer,
    #[serde(rename(deserialize = "isOwner"))]
    pub is_owner: bool,
    success: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum NumberString {
  Number(u32),
  String(String)
}

#[derive(Deserialize, Debug, Clone)]
pub struct GameStartEventPlayer {
    pub id: NumberString,
    pub nickname: String,
}

#[derive(Deserialize, Debug)]
pub struct GameStateEvent {
    #[serde(rename(deserialize = "ballX"))]
    pub ball_x: f64,
    #[serde(rename(deserialize = "ballY"))]
    pub ball_y: f64,
    #[serde(rename(deserialize = "paddle1Y"))]
    pub paddle1_y: f64,
    #[serde(rename(deserialize = "paddle2Y"))]
    pub paddle2_y: f64,
    #[serde(rename(deserialize = "ownerScore"))]
    pub owner_score: usize,
    #[serde(rename(deserialize = "guestScore"))]
    pub guest_score: usize,
}

#[derive(Deserialize, Debug)]
pub struct GameAbortedEvent {
    message: String,
}

#[derive(Deserialize, Debug)]
pub struct FinalScore {
    pub owner: usize,
    pub guest: usize,
}

#[derive(Deserialize, Debug)]
pub struct GameOverEvent {
    pub winner: String,
    #[serde(rename(deserialize = "finalScore"))]
    pub final_score: FinalScore,
    pub message: String,
}

#[derive(Debug)]
pub enum WebSocketEvents {
    JoinedRoom(JoinedRoomEvent),
    GameStart(GameStartEvent),
    GameState(GameStateEvent),
    GameAborted(GameAbortedEvent),
    GameOver(GameOverEvent),
    Ping,
}
