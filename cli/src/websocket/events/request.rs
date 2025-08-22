use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum EventTypes {
    CreateRoom,
    JoinRoom {
        #[serde(rename(serialize = "roomId"))]
        room_id: String,
    },
    PaddleMove {
        #[serde(rename(serialize = "yPos"))]
        y_pos: f64,
    },
    LeaveRoom,
}

#[derive(Serialize, Debug)]
pub struct EventRequest(String, EventTypes);

impl EventRequest {
    pub fn new(event_name: &str, data: &EventTypes) -> Self {
        Self(event_name.to_owned(), data.clone())
    }
}
