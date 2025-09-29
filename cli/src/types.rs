use crate::websocket::events::websocketevents::GameStartEventPlayer;

#[derive(Debug, Clone)]
pub struct Player {
    pub player: GameStartEventPlayer,
    pub pos_y: f64,
    pub score: usize,
}

impl Player {
    pub fn new(player: GameStartEventPlayer, pos_y: f64) -> Self {
        Self {
            player,
            pos_y,
            score: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Position {
    pub pos_y: f64,
    pub pos_x: f64,
}
