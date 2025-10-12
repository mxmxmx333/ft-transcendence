use crossterm::event::{Event, KeyEventKind};
use ratatui::Frame;

use crate::websocket::events::request::PaddleMoveDirection;

use super::{
    game::Game, game_lobby::GameLobbyPage, game_over::GameOverPage, gamemode::{GameModePage, GameModes}, host_selector::HostSelectorPage, join_room::JoinRoomPage, login::LoginPage, nickname_page::NicknamePage, totp::TotpPage
};

#[derive(Debug, Clone)]
pub enum Pages {
    HostSelector(HostSelectorPage),
    NicknameSelector(NicknamePage),
    Login(LoginPage),
    TotpPage(TotpPage),
    GameModeSelector(GameModePage),
    JoinRoom(JoinRoomPage),
    GameLobby(GameLobbyPage),
    Game(Game),
    GameOver(GameOverPage),
}

impl Pages {
    pub fn render(&mut self, frame: &mut Frame) {
        match self {
            Self::HostSelector(page) => page.render(frame),
            Self::NicknameSelector(page) => page.render(frame),
            Self::Login(page) => page.render(frame),
            Self::TotpPage(page) => page.render(frame),
            Self::GameModeSelector(page) => page.render(frame),
            Self::JoinRoom(page) => page.render(frame),
            Self::GameLobby(page) => page.render(frame),
            Self::Game(page) => page.render(frame),
            Self::GameOver(page) => page.render(frame),
        }
    }

    pub fn key_event(&mut self, event: &Event, kind: KeyEventKind) -> Option<PageResults> {
        match (self, kind) {
            (Self::HostSelector(page), KeyEventKind::Press) => page.key_event(event),
            (Self::NicknameSelector(page), KeyEventKind::Press) => page.key_event(event),
            (Self::Login(page), KeyEventKind::Press) => page.key_event(event),
            (Self::TotpPage(page), KeyEventKind::Press) => page.key_event(event),
            (Self::GameModeSelector(page), KeyEventKind::Press) => page.key_event(event),
            (Self::JoinRoom(page), KeyEventKind::Press) => page.key_event(event),
            (Self::GameLobby(page), KeyEventKind::Press) => page.key_event(event),
            (Self::Game(page), _) => page.key_event(event),
            (Self::GameOver(page), KeyEventKind::Press) => page.key_event(event),
            (_, _) => None,
        }
    }

    pub fn needs_update(&self) -> bool {
        match self {
            Self::HostSelector(page) => page.needs_update(),
            Self::NicknameSelector(page) => page.needs_update(),
            Self::Login(loginpage) => loginpage.needs_update(),
            Self::TotpPage(page) => page.needs_update(),
            Self::GameModeSelector(gamemodepage) => gamemodepage.needs_update(),
            Self::JoinRoom(joinroompage) => joinroompage.needs_update(),
            Self::GameLobby(page) => page.needs_update(),
            Self::Game(game) => game.needs_update(),
            Self::GameOver(page) => page.needs_update(),
        }
    }
}

#[derive(Debug)]
pub enum LoginType {
  LocalLogin,
  RemoteLogin,
}

#[derive(Debug)]
pub enum PageResults {
    HostSelected((String, LoginType)),
    NicknameSelected(String),
    Login((String, String)),
    Totp(String),
    BackToMenu,
    GameModeChosen(GameModes),
    JoinRoom(String),
    UpdatePaddleMovement((PaddleMoveDirection, PaddleMoveDirection)),
    GamePaused(bool),
    GameOver,
    Exit,
}
