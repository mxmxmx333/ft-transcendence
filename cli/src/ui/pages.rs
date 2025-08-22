use crossterm::event::Event;
use ratatui::Frame;

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

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        match self {
            Self::Login(page) => page.key_event(event),
            Self::GameModeSelector(page) => page.key_event(event),
            Self::JoinRoom(page) => page.key_event(event),
            Self::GameLobby(page) => page.key_event(event),
            Self::Game(page) => page.key_event(event),
            Self::GameOver(page) => page.key_event(event),
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
    Login((String, String)),
    BackToMenu,
    GameModeChosen(GameModes),
    JoinRoom(String),
    UpdatePosition(f64),
    GameOver,
    Exit,
}
