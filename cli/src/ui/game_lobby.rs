use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    style::{Color, Style},
    widgets::{Block, Paragraph},
};

use super::pages::PageResults;

#[derive(Debug, Clone)]
pub struct GameLobbyPage {
    room_id: String,
    needs_update: bool,
}

impl GameLobbyPage {
    pub fn new(room_id: String) -> Self {
        Self {
            room_id,
            needs_update: true,
        }
    }
    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, room_id] =
            Layout::vertical([Constraint::Percentage(30), Constraint::Length(3)]).areas(horizontal);

        let style: Style = Color::Gray.into();

        let input = Paragraph::new(format!("Room ID: {}", self.room_id))
            .style(style)
            .block(Block::bordered());
        frame.render_widget(input, room_id);

        self.needs_update = false;
    }

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        if let Event::Key(key) = event {
            if key.code == KeyCode::Esc {
                return Some(PageResults::BackToMenu);
            }
        }
        None
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
