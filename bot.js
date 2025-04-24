const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU'; // Replace with your bot token
const bot = new Telegraf(TOKEN);

// For Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const games = {}; // chatId => game state

function initGame(chatId, player1) {
    games[chatId] = {
        board: Array(9).fill(""),
        players: [player1],
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

// Start game with /tictactoe
bot.command("tictactoe", ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (games[chatId]) {
        return ctx.reply("Game already in progress!");
    }

    initGame(chatId, userId);
    ctx.reply("Game created! Waiting for second player to join:", Markup.inlineKeyboard([
        [Markup.button.callback("Join Game", "join_game")]
    ]));
});

bot.action("join_game", async ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const game = games[chatId];

    if (!game) {
        return ctx.answerCbQuery("No game found.");
    }

    if (game.players.length >= 2) {
        return ctx.answerCbQuery("Game is already full.");
    }

    if (game.players.includes(userId)) {
        return ctx.answerCbQuery("You already joined.");
    }

    game.players.push(userId);
    await ctx.editMessageText("Game started! Player X and O are ready.");
    await ctx.telegram.sendMessage(chatId, `Player X's turn`, generateBoardMarkup(game.board));
});

bot.on('callback_query', async ctx => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;

    if (data === "join_game") return; // already handled

    const game = games[chatId];
    if (!game || game.players.length < 2) return;

    const { board, players, turn } = game;
    const index = parseInt(data);

    if (userId !== players[turn]) {
        return ctx.answerCbQuery("Not your turn!");
    }

    if (board[index] !== "") {
        return ctx.answerCbQuery("Already taken!");
    }

    const symbol = getSymbol(turn);
    board[index] = symbol;

    if (checkWinner(board, symbol)) {
        await ctx.editMessageText(`Player ${symbol} wins!`);
        delete games[chatId];
        return;
    }

    if (isDraw(board)) {
        await ctx.editMessageText("It's a draw!");
        delete games[chatId];
        return;
    }

    game.turn = 1 - turn;
    await ctx.editMessageText(`Player ${getSymbol(game.turn)}'s turn`, generateBoardMarkup(board));
});

bot.launch();
