use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct CreateRoomRequest {
    #[serde(rename(serialize = "isSinglePlayer"))]
    is_single_player: bool,
    #[serde(rename(serialize = "isRemote"))]
    is_remote: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct CreateRoomPayload {
    create_room: CreateRoomRequest,
}

impl CreateRoomPayload {
    pub fn singleplayer() -> Self {
        Self {
            create_room: CreateRoomRequest {
                is_single_player: true,
                is_remote: false,
            },
        }
    }

    pub fn multiplayer() -> Self {
        Self {
            create_room: CreateRoomRequest {
                is_single_player: false,
                is_remote: true,
            },
        }
    }
}

impl CreateRoomRequest {
    pub fn singleplayer() -> Self {
        Self {
            is_single_player: true,
            is_remote: false,
        }
    }

    pub fn multiplayer() -> Self {
        Self {
            is_single_player: false,
            is_remote: true,
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PaddleMoveDirection {
    Up,
    Down,
    None,
}

#[derive(Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum EventTypes {
    CreateRoom(CreateRoomRequest),
    JoinRoom {
        #[serde(rename(serialize = "roomId"))]
        room_id: String,
    },
    PaddleMove {
        #[serde(rename(serialize = "moveP1"))]
        move_p1: PaddleMoveDirection,
        #[serde(rename(serialize = "moveP2"))]
        move_p2: PaddleMoveDirection,
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
