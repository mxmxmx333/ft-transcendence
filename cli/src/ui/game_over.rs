use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    widgets::{Block, Paragraph},
};

use super::{game::GameResult, pages::PageResults};

#[derive(Debug, Clone)]
pub struct GameOverPage {
    needs_update: bool,
    game_result: GameResult,
}

impl GameOverPage {
    pub fn new(game_result: GameResult) -> Self {
        Self {
            needs_update: true,
            game_result,
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, area] =
            Layout::vertical([Constraint::Percentage(30), Constraint::Length(4)]).areas(horizontal);

        let title = format!("You {}", if self.game_result.won { "won" } else { "lost" });
        let content = format!(
            "{}: {}\n{}: {}",
            self.game_result.player_a.player.nickname,
            self.game_result.player_a.score,
            self.game_result.player_b.player.nickname,
            self.game_result.player_b.score
        );

        let input = Paragraph::new(content).block(Block::bordered().title(title));
        frame.render_widget(input, area);

        self.needs_update = false;
    }

    pub fn key_event(&self, event: &Event) -> Option<PageResults> {
        if let Event::Key(key) = event {
            match key.code {
                KeyCode::Esc | KeyCode::Enter => return Some(PageResults::GameOver),
                _ => (),
            }
        }
        None
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
