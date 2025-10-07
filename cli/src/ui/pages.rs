use crossterm::event::{Event, KeyEventKind};
use ratatui::Frame;

use crate::websocket::events::request::PaddleMoveDirection;

use super::{
    game::Game,
    game_lobby::GameLobbyPage,
    game_over::GameOverPage,
    gamemode::{GameModePage, GameModes},
    join_room::JoinRoomPage,
    login::LoginPage,
};

#[derive(Debug, Clone)]
pub enum Pages {
    Login(LoginPage),
    GameModeSelector(GameModePage),
    JoinRoom(JoinRoomPage),
    GameLobby(GameLobbyPage),
    Game(Game),
    GameOver(GameOverPage),
}

impl Pages {
    pub fn render(&mut self, frame: &mut Frame) {
        match self {
            Self::Login(page) => page.render(frame),
            Self::GameModeSelector(page) => page.render(frame),
            Self::JoinRoom(page) => page.render(frame),
            Self::GameLobby(page) => page.render(frame),
            Self::Game(page) => page.render(frame),
            Self::GameOver(page) => page.render(frame),
        }
    }

    pub fn key_event(&mut self, event: &Event, kind: KeyEventKind) -> Option<PageResults> {
        match (self, kind) {
            (Self::Login(page), KeyEventKind::Press) => page.key_event(event),
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
            Self::Login(loginpage) => loginpage.needs_update(),
            Self::GameModeSelector(gamemodepage) => gamemodepage.needs_update(),
            Self::JoinRoom(joinroompage) => joinroompage.needs_update(),
            Self::GameLobby(page) => page.needs_update(),
            Self::Game(game) => game.needs_update(),
            Self::GameOver(page) => page.needs_update(),
        }
    }
}

#[derive(Debug)]
pub enum PageResults {
    Login((String, String, String)),
    BackToMenu,
    GameModeChosen(GameModes),
    JoinRoom(String),
    UpdatePaddleMovement((PaddleMoveDirection, PaddleMoveDirection)),
    GameOver,
    Exit,
}
