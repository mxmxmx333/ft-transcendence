use serde::{Deserialize, Serialize};
use std::{error::Error, fmt::Display};

#[derive(Serialize)]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
struct SetNicknameRequest<'a> {
    nickname: &'a str,
}

#[derive(Serialize)]
struct TotpRequest<'a> {
    totp_code: &'a str,
}

#[derive(Deserialize, Debug)]
#[serde(untagged)]
pub enum BoolOrString {
  Bool(bool),
  String(String),
}

#[derive(Deserialize, Debug)]
pub struct LoginResponse {
    success: bool,
    pub token: String,
    pub action_required: BoolOrString,
    pub user: Option<User>,
}

#[derive(Deserialize, Debug)]
pub struct RedirectResponse {
  pub url: String,
}

#[derive(Deserialize, Debug)]
pub struct NicknameResponse {
  pub success: bool,
  pub token: Option<String>,
  pub error: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct User {
    pub id: usize,
    pub nickname: String,
}

#[derive(Debug)]
pub enum LoginErrors {
    ConnectionError,
    InvalidResponse,
    InvalidCredentials,
    NicknameMissing,
    ServerError,
    Unknown(String),
}

#[derive(Debug)]
pub enum TotpErrors {
    ConnectionError,
    InvalidResponse,
    InvalidTotp,
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
            Self::NicknameMissing => write!(f, "Please set a Nickname on the website first"),
            Self::Unknown(err) => write!(f, "Error: {}", err),
        }
    }
}

impl Error for LoginErrors {}

impl Display for TotpErrors {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionError => write!(f, "Connection Error"),
            Self::InvalidResponse => write!(f, "Invalid response received from server"),
            Self::InvalidTotp => write!(f, "Incorrect 2FA code"),
            Self::ServerError => write!(f, "Internal Server Error"),
            Self::Unknown(err) => write!(f, "Unknown Error: {}", err),
        }
    }
}

impl Error for TotpErrors {}

pub async fn login(host: &str, email: &str, password: &str) -> Result<LoginResponse, LoginErrors> {
    let body = LoginRequest { email, password };

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|err| LoginErrors::Unknown(err.to_string()))?;

    let endpoint = if cfg!(debug_assertions) {
        format!("https://{}:3000/api/login", host)
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

    match response_body.action_required {
      BoolOrString::Bool(true) => return Err(LoginErrors::Unknown("action_required set to true".to_string())),
      BoolOrString::String(ref str) => {
        match str.as_str() {
          "nickname" => return Err(LoginErrors::NicknameMissing),
          "2fa" => (),
          _ => return Err(LoginErrors::Unknown("Invalid value for action_required(String)".to_string())),
        }
      },
      _ => (),
    }

    Ok(response_body)
}


pub async fn remotelogin(host: &str, port: u16) -> Result<RedirectResponse, LoginErrors> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|err| LoginErrors::Unknown(err.to_string()))?;

    let endpoint = if cfg!(debug_assertions) {
        format!("https://{}:3000/api/auth/42", host)
    } else {
        format!("https://{}:8443/api/auth/42", host)
    };

    let response = client
      .get(endpoint)
      .query(&[("cli_port", port)])
      .send()
      .await
      .map_err(|_| LoginErrors::ConnectionError)?;

    if response.status().is_server_error() {
        return Err(LoginErrors::ServerError);
    } else if response.status().is_client_error() {
        return Err(LoginErrors::Unknown("Received client error from redirect response".to_string()));
    }

    let response_body: RedirectResponse = response
        .json()
        .await
        .map_err(|_| LoginErrors::InvalidResponse)?;

    Ok(response_body)
}

pub async fn set_nickname(host: &str, token: &str, nickname: &str) -> Result<NicknameResponse, LoginErrors> {
    let body = SetNicknameRequest { nickname };

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|err| LoginErrors::Unknown(err.to_string()))?;

    let endpoint = if cfg!(debug_assertions) {
        format!("https://{}:3000/api/profile/set-nickname", host)
    } else {
        format!("https://{}:8443/api/profile/set-nickname", host)
    };

    let response = client
      .post(endpoint)
      .header("Authorization", format!("Bearer {}", token))
      .json(&body)
      .send()
      .await
      .map_err(|_| LoginErrors::ConnectionError)?;

    if response.status().is_server_error() {
        return Err(LoginErrors::ServerError);
    } else if response.status().is_client_error() {
        return Err(LoginErrors::Unknown("Received client error from nickname response".to_string()));
    }

    let response_body: NicknameResponse = response
        .json()
        .await
        .map_err(|_| LoginErrors::InvalidResponse)?;

    Ok(response_body)
}

pub async fn login2fa(host: &str, auth_token: &str, totp_code: &str) -> Result<LoginResponse, TotpErrors> {
    let body = TotpRequest { totp_code };

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|err| TotpErrors::Unknown(err.to_string()))?;

    let endpoint = if cfg!(debug_assertions) {
        format!("https://{}:3000/api/auth/2fa/login", host)
    } else {
        format!("https://{}:8443/api/auth/2fa/login", host)
    };

    let response = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", auth_token))
        .json(&body)
        .send()
        .await
        .map_err(|_| TotpErrors::ConnectionError)?;

    if response.status().is_server_error() {
        return Err(TotpErrors::ServerError);
    } else if response.status().is_client_error() {
        return Err(TotpErrors::InvalidTotp);
    }

    let response_body: LoginResponse = response
        .json()
        .await
        .map_err(|_| TotpErrors::InvalidResponse)?;

    if !response_body.success {
        return Err(TotpErrors::Unknown("Success set to false".to_string()));
    }

    Ok(response_body)
}
