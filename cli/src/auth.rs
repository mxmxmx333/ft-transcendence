use serde::{Deserialize, Serialize};
use std::{error::Error, fmt::Display};

#[derive(Serialize)]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Deserialize, Debug)]
pub struct LoginResponse {
    success: bool,
    pub token: String,
    pub user: User,
}

#[derive(Deserialize, Debug)]
pub struct User {
    pub id: usize,
    pub nickname: String,
    pub email: String,
}

#[derive(Debug)]
pub enum LoginErrors {
    ConnectionError,
    InvalidResponse,
    InvalidCredentials,
    ServerError,
    Unknown(String),
}

impl Display for LoginErrors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionError => write!(f, "Connection Error"),
            Self::InvalidResponse => write!(f, "Invalid response received from server"),
            Self::InvalidCredentials => write!(f, "Incorrect email or password"),
            Self::ServerError => write!(f, "Internal Server Error"),
            Self::Unknown(err) => write!(f, "Unknown Error: {}", err),
        }
    }
}

impl Error for LoginErrors {}

pub async fn login(host: &str, email: &str, password: &str) -> Result<LoginResponse, LoginErrors> {
    let body = LoginRequest { email, password };

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|err| LoginErrors::Unknown(err.to_string()))?;

    let endpoint = if cfg!(debug_assertions) {
        format!("http://{}:3000/api/login", host)
    } else {
        format!("https://{}:8443/api/login", host)
    };

    let response = client
        .post(endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|_| LoginErrors::ConnectionError)?;

    if response.status().is_server_error() {
        return Err(LoginErrors::ServerError);
    } else if response.status().is_client_error() {
        return Err(LoginErrors::InvalidCredentials);
    }

    let response_body: LoginResponse = response
        .json()
        .await
        .map_err(|_| LoginErrors::InvalidResponse)?;

    if !response_body.success {
        return Err(LoginErrors::Unknown("Success set to false".to_string()));
    }

    Ok(response_body)
}
