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
    success: bool,
    #[serde(rename(deserialize = "isPlayer1"))]
    pub is_player1: bool,
    opponent: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GameStartEventPlayer {
    pub id: usize,
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
pub struct PaddleUpdateEvent {
    #[serde(rename(deserialize = "playerId"))]
    pub player_id: usize,
    #[serde(rename(deserialize = "yPos"))]
    pub y_pos: f64,
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
    CreateRoom(CreateRoomEvent),
    JoinedRoom(JoinedRoomEvent),
    GameStart(GameStartEvent),
    GameState(GameStateEvent),
    PaddleUpdate(PaddleUpdateEvent),
    GameAborted(GameAbortedEvent),
    GameOver(GameOverEvent),
    Ping,
}
