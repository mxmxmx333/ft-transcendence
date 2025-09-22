use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    style::{Color, Style},
    widgets::{Block, Paragraph},
};

use super::pages::PageResults;

#[derive(Debug, Clone)]
pub enum GameModes {
    SinglePlayer,
    CreateRoom,
    JoinRoom,
}

impl GameModes {
    fn toggle(&self) -> Self {
        match self {
            Self::SinglePlayer => Self::CreateRoom,
            Self::CreateRoom => Self::JoinRoom,
            Self::JoinRoom => Self::SinglePlayer,
        }
    }

    fn prev(&self) -> Self {
        match self {
            Self::JoinRoom => Self::CreateRoom,
            _ => Self::SinglePlayer,
        }
    }

    fn next(&self) -> Self {
        match self {
            Self::SinglePlayer => Self::CreateRoom,
            _ => Self::JoinRoom,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameModePage {
    selection: GameModes,
    needs_update: bool,
    error_message: Option<String>,
}

impl GameModePage {
    pub fn new() -> Self {
        Self {
            selection: GameModes::SinglePlayer,
            needs_update: true,
            error_message: None,
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, single, createroom, joinroom, error] = Layout::vertical([
            Constraint::Percentage(30),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
        ])
        .areas(horizontal);

        let style: Style = match self.selection {
            GameModes::SinglePlayer => Color::Rgb(255, 0, 255),
            _ => Color::Gray,
        }
        .into();

        let input = Paragraph::new("Single Player")
            .style(style)
            .block(Block::bordered());
        frame.render_widget(input, single);

        let style: Style = match self.selection {
            GameModes::CreateRoom => Color::Rgb(255, 0, 255),
            _ => Color::Gray,
        }
        .into();

        let input = Paragraph::new("Create Room")
            .style(style)
            .block(Block::bordered());
        frame.render_widget(input, createroom);

        let style: Style = match self.selection {
            GameModes::JoinRoom => Color::Rgb(255, 0, 255),
            _ => Color::Gray,
        }
        .into();

        let input = Paragraph::new("Join Room")
            .style(style)
            .block(Block::bordered());
        frame.render_widget(input, joinroom);

        if let Some(msg) = self.error_message.as_ref() {
            let style: Style = Color::Red.into();
            let input = Paragraph::new(msg.to_owned())
                .style(style)
                .block(Block::bordered().title("Error"));
            frame.render_widget(input, error);
        }

        self.needs_update = false;
    }

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        if let Event::Key(key) = event {
            match key.code {
                KeyCode::Esc => return Some(PageResults::Exit),
                KeyCode::Tab => self.focus_widget(self.selection.toggle()),
                KeyCode::Up => self.focus_widget(self.selection.prev()),
                KeyCode::Down => self.focus_widget(self.selection.next()),
                KeyCode::Enter => match self.selection {
                    GameModes::SinglePlayer => {
                        return Some(PageResults::GameModeChosen(GameModes::SinglePlayer));
                    }
                    GameModes::CreateRoom => {
                        return Some(PageResults::GameModeChosen(GameModes::CreateRoom));
                    }
                    GameModes::JoinRoom => {
                        return Some(PageResults::GameModeChosen(GameModes::JoinRoom));
                    }
                },
                _ => (),
            }
        }
        None
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }

    fn focus_widget(&mut self, mode: GameModes) {
        self.needs_update = true;
        self.selection = mode;
    }
}
