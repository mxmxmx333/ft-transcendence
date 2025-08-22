use std::{error::Error, fmt::Display};

#[derive(Debug)]
pub enum WebSocketErrors {
    ConnectionError,
    InvalidResponse,
    HandshakeError,
    InvalidCredentials,
    ServerError,
    UrlParsingError,
    Unknown,
}

impl Display for WebSocketErrors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionError => write!(f, "Connection Error"),
            Self::InvalidResponse => write!(f, "Invalid response received from server"),
            Self::HandshakeError => write!(f, "Error during Socket.io Handshake"),
            Self::InvalidCredentials => write!(f, "Incorrect email or password"),
            Self::ServerError => write!(f, "Internal Server Error"),
            Self::UrlParsingError => write!(f, "Unable to parse url"),
            Self::Unknown => write!(f, "Unknown Error"),
        }
    }
}

impl Error for WebSocketErrors {}
