const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU';
const bot = new Telegraf(TOKEN);

// Express server for Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Game store - separate game per group chat
const games = {}; // chatId => game object

function initGame(chatId, player1) {
    games[chatId] = {
        board: Array(9).fill(""),
        players: [player1],
        names: {},
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

// /start command
bot.start(ctx => {
    const name = ctx.from.first_name;
    ctx.replyWithHTML(
        `<b>Welcome ${name}!</b>\n\n` +
        `This is a 2-player <b>Tic Tac Toe</b> bot.\n\n` +
        `Use <code>/tictactoe</code> in a <b>group</b> to start a game.`
    );
});

// Only works in group
bot.command("tictactoe", ctx => {
    const chat = ctx.chat;
    const user = ctx.from;

    if (chat.type === "private") {
        return ctx.reply("❌ This command only works in groups!");
    }

    const chatId = chat.id;
    const userId = user.id;

    if (games[chatId]) {
        return ctx.reply("⚠️ A game is already in progress in this group.");
    }

    initGame(chatId, userId);
    games[chatId].names[userId] = user.first_name;

    ctx.replyWithHTML(
        `<b>Game Created!</b>\n\n` +
        `Player <b>X</b>: ${user.first_name}\n\n` +
        `Waiting for <b>Player O</b> to join...`,
        Markup.inlineKeyboard([[Markup.button.callback("▶️ Join Game", `join_${chatId}`)]])
    );
});

// Join game
bot.action(/^join_(.+)/, async ctx => {
    const chatId = parseInt(ctx.match[1]);
    const user = ctx.from;
    const userId = user.id;
    const game = games[chatId];

    if (!game) return ctx.answerCbQuery("No game found.");
    if (game.players.length >= 2) return ctx.answerCbQuery("Game is already full.");
    if (game.players.includes(userId)) return ctx.answerCbQuery("You already joined.");

    game.players.push(userId);
    game.names[userId] = user.first_name;

    const [p1, p2] = game.players;
    const nameX = game.names[p1];
    const nameO = game.names[p2];

    await ctx.editMessageText(
        `<b>Game Started!</b>\n\n` +
        `Player <b>X</b>: ${nameX}\n` +
        `Player <b>O</b>: ${nameO}\n\n` +
        `It's <b>${nameX}</b>'s turn (X)`,
        { parse_mode: "HTML" }
    );

    await ctx.telegram.sendMessage(
        chatId,
        `It's <b>${nameX}</b>'s turn (X)`,
        { parse_mode: "HTML", reply_markup: generateBoardMarkup(game.board).reply_markup }
    );
});

// Board clicks
bot.on('callback_query', async ctx => {
    const chatId = ctx.chat?.id || ctx.callbackQuery.message.chat.id;
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;

    // Skip join actions
    if (data.startsWith("join_")) return;

    const game = games[chatId];
    if (!game || game.players.length < 2) return ctx.answerCbQuery("No active game.");

    const index = parseInt(data);
    const { board, players, names, turn } = game;

    if (userId !== players[turn]) return ctx.answerCbQuery("Not your turn!");
    if (board[index] !== "") return ctx.answerCbQuery("Already taken!");

    const symbol = getSymbol(turn);
    board[index] = symbol;

    if (checkWinner(board, symbol)) {
        await ctx.editMessageText(
            `<b>Player ${symbol} (${names[userId]}) wins!</b>`,
            { parse_mode: "HTML" }
        );
        delete games[chatId];
        return;
    }

    if (isDraw(board)) {
        await ctx.editMessageText(`<b>It's a draw!</b>`, { parse_mode: "HTML" });
        delete games[chatId];
        return;
    }

    game.turn = 1 - turn;
    const nextPlayerId = players[game.turn];
    const nextName = names[nextPlayerId];

    await ctx.editMessageText(
        `It's <b>${nextName}</b>'s turn (${getSymbol(game.turn)})`,
        {
            parse_mode: "HTML",
            reply_markup: generateBoardMarkup(board).reply_markup
        }
    );
});

// Launch
bot.launch();
