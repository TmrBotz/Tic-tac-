const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU'; // Replace with your token
const bot = new Telegraf(TOKEN);

// For Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const games = {}; // Active games
const scores = {}; // { userId: { wins: 0 } }

function initGame(chatId, player1, player2 = null) {
    games[chatId] = {
        board: Array(9).fill(""),
        players: [player1],
        invited: player2,
        turn: 0
    };
}

function getSymbol(turn) {
    return turn === 0 ? "X" : "O";
}

function generateBoardMarkup(board) {
    return Markup.inlineKeyboard([
        [0, 1, 2].map(i => Markup.button.callback(board[i] || ".", String(i))),
        [3, 4, 5].map(i => Markup.button.callback(board[i] || ".", String(i))),
        [6, 7, 8].map(i => Markup.button.callback(board[i] || ".", String(i)))
    ]);
}

function checkWinner(board, player) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    return wins.some(combo => combo.every(i => board[i] === player));
}

function isDraw(board) {
    return board.every(cell => cell !== "");
}

function updateScore(userId) {
    if (!scores[userId]) scores[userId] = { wins: 0 };
    scores[userId].wins += 1;
}

function getScoreText(player1, player2) {
    const score1 = scores[player1]?.wins || 0;
    const score2 = scores[player2]?.wins || 0;
    return `Score:\nPlayer X: ${score1} wins\nPlayer O: ${score2} wins`;
}

// Start game (public or private)
bot.command("tictactoe", ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const mentionedUser = ctx.message.entities?.find(e => e.type === 'mention');
    const targetUsername = ctx.message.text.split(' ')[1];

    if (games[chatId]) {
        return ctx.reply("A game is already in progress. Use /leavegame to cancel it.");
    }

    let invitedId = null;
    if (targetUsername?.startsWith('@')) {
        invitedId = targetUsername; // store username (we will match later)
    }

    initGame(chatId, userId, invitedId);
    ctx.reply(`Game created! ${invitedId ? `Waiting for ${invitedId} to join.` : 'Waiting for second player.'}`, Markup.inlineKeyboard([
        [Markup.button.callback("Join Game", "join_game")],
        [Markup.button.callback("Leave Game", "leave_game")]
    ]));
});

// Join Game
bot.action("join_game", async ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = `@${ctx.from.username}`;
    const game = games[chatId];

    if (!game) return ctx.answerCbQuery("No game found.");
    if (game.players.length >= 2) return ctx.answerCbQuery("Game already has 2 players.");
    if (game.players.includes(userId)) return ctx.answerCbQuery("You're already in.");
    if (game.invited && game.invited !== username) return ctx.answerCbQuery("Only the invited user can join.");

    game.players.push(userId);
    await ctx.editMessageText("Game started! Player X and O are ready.");
    await ctx.telegram.sendMessage(chatId, `Player X's turn`, generateBoardMarkup(game.board));
});

// Leave Game
bot.action("leave_game", async ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    const game = games[chatId];
    if (!game) return ctx.answerCbQuery("No active game.");

    if (game.players.includes(userId)) {
        delete games[chatId];
        await ctx.editMessageText("Game cancelled by a player.");
    } else {
        ctx.answerCbQuery("You're not part of this game.");
    }
});

// Game moves
bot.on('callback_query', async ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;

    if (["join_game", "leave_game", "play_again"].includes(data)) return;

    const game = games[chatId];
    if (!game || game.players.length < 2) return;

    const { board, players, turn } = game;
    const index = parseInt(data);

    if (userId !== players[turn]) return ctx.answerCbQuery("Not your turn!");
    if (board[index] !== "") return ctx.answerCbQuery("Already taken!");

    const symbol = getSymbol(turn);
    board[index] = symbol;

    if (checkWinner(board, symbol)) {
        updateScore(players[turn]);
        await ctx.editMessageText(`Player ${symbol} wins!\n\n${getScoreText(players[0], players[1])}`, Markup.inlineKeyboard([
            [Markup.button.callback("Play Again", "play_again")]
        ]));
        return;
    }

    if (isDraw(board)) {
        await ctx.editMessageText(`It's a draw!\n\n${getScoreText(players[0], players[1])}`, Markup.inlineKeyboard([
            [Markup.button.callback("Play Again", "play_again")]
        ]));
        return;
    }

    game.turn = 1 - turn;
    await ctx.editMessageText(`Player ${getSymbol(game.turn)}'s turn`, generateBoardMarkup(board));
});

// Play Again
bot.action("play_again", async ctx => {
    const chatId = ctx.chat.id;
    const game = games[chatId];

    if (!game || game.players.length < 2) {
        return ctx.answerCbQuery("Cannot restart. No previous game found.");
    }

    game.board = Array(9).fill("");
    game.turn = 0;

    await ctx.editMessageText(`New Game! Player X's turn`, generateBoardMarkup(game.board));
});

bot.launch();
