use std::time::Instant;

use crate::websocket::events::request::PaddleMoveDirection;

#[derive(Debug, Clone)]
pub struct Movement {
    direction: PaddleMoveDirection,
    first_keystroke: bool,
    since: Option<Instant>,
}

impl Movement {
    pub fn new() -> Self {
        Self {
            direction: PaddleMoveDirection::None,
            first_keystroke: false,
            since: None,
        }
    }

    pub fn update(&mut self, direction: &PaddleMoveDirection) {
        self.first_keystroke = self.direction.ne(direction);
        self.direction = direction.clone();
        self.since = match self.direction {
            PaddleMoveDirection::None => None,
            _ => Some(Instant::now()),
        }
    }

    pub fn first_keystroke(&self) -> bool {
        self.first_keystroke
    }

    pub fn movement_stopped(&mut self) -> bool {
        if self.direction != PaddleMoveDirection::None {
            let duration = self.since.unwrap().elapsed().as_millis();
            if duration > 30 {
                self.update(&PaddleMoveDirection::None);
                return true;
            }
        }
        false
    }
}
