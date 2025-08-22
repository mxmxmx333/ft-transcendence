use crate::types::{Player, Position};
use crate::websocket::events::websocketevents::{
    GameOverEvent, GameStartEvent, GameStartEventPlayer, GameStateEvent, PaddleUpdateEvent,
};
use crossterm::event::{Event, KeyCode};
use ratatui::Frame;
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Style, Stylize};
use ratatui::symbols::Marker;
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::canvas::Canvas;
use ratatui::widgets::{Block, Borders, Paragraph};

use super::pages::PageResults;
use super::widgets::ball::Ball;
use super::widgets::filledrectangle::FilledRectangle;

#[derive(Debug, PartialEq, Clone)]
enum CurrentPlayer {
    PlayerA,
    PlayerB,
}

impl From<bool> for CurrentPlayer {
    fn from(is_player1: bool) -> Self {
        match is_player1 {
            true => CurrentPlayer::PlayerA,
            false => CurrentPlayer::PlayerB,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameResultPlayer {
    pub player: GameStartEventPlayer,
    pub score: usize,
}

#[derive(Debug, Clone)]
pub struct GameResult {
    pub won: bool,
    pub player_a: GameResultPlayer,
    pub player_b: GameResultPlayer,
}

#[derive(Debug, Clone)]
pub struct Game {
    player_a: Player,
    player_b: Player,
    current_player: CurrentPlayer,
    ball: Position,
    owner_score_widget: Rect,
    game_widget: Rect,
    guest_score_widget: Rect,
    last_sizes: (u16, u16),
    needs_update: bool,
}

impl Game {
    pub fn new(start_event: GameStartEvent, frame: &Frame) -> Self {
        let (owner_score_widget, game_widget, guest_score_widget) = setup_widgets(frame);
        Self {
            player_a: Player::new(start_event.owner, start_event.paddle1_y),
            player_b: Player::new(start_event.guest, start_event.paddle2_y),
            current_player: start_event.is_player1.into(),
            ball: Position {
                pos_y: start_event.ball_y,
                pos_x: start_event.ball_x,
            },
            owner_score_widget,
            game_widget,
            guest_score_widget,
            last_sizes: (frame.area().width, frame.area().height),
            needs_update: true,
        }
    }

    pub fn update(&mut self, state_event: &GameStateEvent) {
        match self.current_player {
            CurrentPlayer::PlayerA => self.player_b.pos_y = state_event.paddle2_y,
            CurrentPlayer::PlayerB => self.player_a.pos_y = state_event.paddle1_y,
        }

        self.player_a.score = state_event.owner_score;
        self.player_b.score = state_event.guest_score;
        self.ball.pos_y = state_event.ball_y;
        self.ball.pos_x = state_event.ball_x;
        self.needs_update = true;
    }

    pub fn paddle_update(&mut self, state_event: &PaddleUpdateEvent) {
        let (own_id, other_player) = match self.current_player {
            CurrentPlayer::PlayerA => (self.player_a.player.id, &mut self.player_b),
            CurrentPlayer::PlayerB => (self.player_b.player.id, &mut self.player_a),
        };

        if own_id == state_event.player_id {
            return;
        }

        other_player.pos_y = state_event.y_pos;
        self.needs_update = true;
    }

    fn render_game(&self, frame: &mut Frame) {
        let canvas = Canvas::default()
            .block(Block::default().title("Pong CLI").borders(Borders::ALL))
            .x_bounds([0.0, 800.0])
            .y_bounds([0.0, 600.0])
            .marker(Marker::HalfBlock)
            .paint(|ctx| {
                ctx.draw(&FilledRectangle {
                    x: 0.0,
                    y: 500.0 - self.player_a.pos_y,
                    width: 10.0,
                    height: 100.0,
                    color: Color::Rgb(255, 0, 255),
                });

                ctx.draw(&FilledRectangle {
                    x: 789.0,
                    y: 500.0 - self.player_b.pos_y,
                    width: 10.0,
                    height: 100.0,
                    color: Color::Rgb(0, 255, 255),
                });
            });

        frame.render_widget(canvas, self.game_widget);

        let canvas = Canvas::default()
            .block(Block::default().title("Pong CLI").borders(Borders::ALL))
            .x_bounds([0.0, 800.0])
            .y_bounds([0.0, 600.0])
            .marker(Marker::Braille)
            .paint(|ctx| {
                ctx.draw(&Ball {
                    x: self.ball.pos_x - 5.0,
                    y: 600.0 - self.ball.pos_y,
                    radius: 10.0,
                    color: Color::Rgb(255, 255, 0),
                });
            });

        frame.render_widget(canvas, self.game_widget);
    }

    pub fn render(&mut self, frame: &mut Frame) {
        if frame.area().width != self.last_sizes.0 || frame.area().height != self.last_sizes.1 {
            (
                self.owner_score_widget,
                self.game_widget,
                self.guest_score_widget,
            ) = setup_widgets(frame);
            self.last_sizes = (frame.area().width, frame.area().height);
        }

        self.render_game(frame);

        let owner_score = get_score_paragraph(
            "Player 1: ",
            &self.player_a.player.nickname,
            self.player_a.score,
        );

        frame.render_widget(owner_score, self.owner_score_widget);

        let guest_score = get_score_paragraph(
            "Player 2: ",
            &self.player_b.player.nickname,
            self.player_b.score,
        );

        frame.render_widget(guest_score, self.guest_score_widget);

        self.needs_update = false;
    }

    fn update_position(&mut self, key: KeyCode) -> Option<PageResults> {
        let pos = match self.current_player {
            CurrentPlayer::PlayerA => &mut self.player_a.pos_y,
            CurrentPlayer::PlayerB => &mut self.player_b.pos_y,
        };

        let newpos = match key {
            KeyCode::Up => 0.0_f64.max(*pos - 20.0),
            KeyCode::Down => 500.0_f64.min(*pos + 20.0),
            _ => unreachable!(),
        };

        match newpos.ne(pos) {
            true => {
                *pos = newpos;
                self.needs_update = true;
                Some(PageResults::UpdatePosition(newpos))
            }
            false => None,
        }
    }

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        if let Event::Key(key) = event {
            match key.code {
                KeyCode::Esc => return Some(PageResults::BackToMenu),
                KeyCode::Up | KeyCode::Down => return self.update_position(key.code),
                _ => (),
            }
        }
        None
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }

    pub fn game_over(&self, game_over: &GameOverEvent) -> GameResult {
        let won = match self.current_player {
            CurrentPlayer::PlayerA => game_over.final_score.owner > game_over.final_score.guest,
            CurrentPlayer::PlayerB => game_over.final_score.guest > game_over.final_score.owner,
        };

        GameResult {
            won,
            player_a: GameResultPlayer {
                player: self.player_a.player.clone(),
                score: game_over.final_score.owner,
            },
            player_b: GameResultPlayer {
                player: self.player_b.player.clone(),
                score: game_over.final_score.guest,
            },
        }
    }
}

fn setup_widgets(frame: &Frame) -> (Rect, Rect, Rect) {
    let [left, game_container, right] = Layout::horizontal([
        Constraint::Length(30),
        Constraint::Min(0),
        Constraint::Length(30),
    ])
    .areas(frame.area());

    let game = get_game_area(game_container);

    let [_, owner, _] = Layout::vertical([
        Constraint::Min(0),
        Constraint::Length(3),
        Constraint::Min(0),
    ])
    .areas(left);

    let [_, guest, _] = Layout::vertical([
        Constraint::Min(0),
        Constraint::Length(3),
        Constraint::Min(0),
    ])
    .areas(right);

    (owner, game, guest)
}

fn get_game_area(area: Rect) -> Rect {
    let game_aspect_ratio = 800.0 / 600.0;
    let termchar_ratio = 1.9;
    let term_ratio = area.width as f64 / (area.height as f64 * termchar_ratio);

    let (width, height) = match term_ratio > game_aspect_ratio {
        true => (
            (area.height as f64 * termchar_ratio * game_aspect_ratio).round() as u16,
            area.height,
        ),
        false => (
            area.width,
            (area.width as f64 / termchar_ratio / game_aspect_ratio) as u16,
        ),
    };

    let [_, vertical, _] = Layout::vertical([
        Constraint::Min(0),
        Constraint::Length(height),
        Constraint::Min(0),
    ])
    .areas(area);

    let [_, game, _] = Layout::horizontal([
        Constraint::Min(0),
        Constraint::Length(width),
        Constraint::Min(0),
    ])
    .areas(vertical);

    game
}

fn get_score_paragraph<'a>(title: &'a str, nickname: &'a str, score: usize) -> Paragraph<'a> {
    let lines = vec![
        Line::from(vec![
            Span::styled(title, Style::default()),
            Span::styled(
                nickname,
                Style::default().bold().fg(Color::Rgb(34, 211, 238)),
            ),
        ]),
        Line::from(vec![
            Span::styled("Score: ", Style::default()),
            Span::styled(
                format!("{}", score),
                Style::default().bold().fg(Color::Rgb(253, 224, 71)),
            ),
        ]),
    ];

    let text = Text::from(lines);
    Paragraph::new(text).centered()
}
