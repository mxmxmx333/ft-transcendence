use std::{
    error::Error,
    fmt::{self, Display},
};

#[derive(Debug)]
pub enum EventError {
    SerializingError,
    ConnectionError,
    InvalidResponse,
    CreateRoomError,
    JoinRoomError,
}

impl Display for EventError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SerializingError => write!(f, "Unable to deserialize Response"),
            Self::ConnectionError => write!(f, "Connection Error"),
            Self::InvalidResponse => write!(f, "Invalid Response"),
            Self::CreateRoomError => write!(f, "Unable to create room"),
            Self::JoinRoomError => write!(f, "Unable to join room"),
        }
    }
}

impl Error for EventError {}
