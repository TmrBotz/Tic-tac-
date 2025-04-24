const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU';
const bot = new Telegraf(TOKEN);

// Express server for Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Games data structure: chatId => { gameId => game }
const games = {};

function initGame(chatId, player1Id) {
    const chatKey = String(chatId);
    if (!games[chatKey]) games[chatKey] = {};
    const gameId = `wait_${player1Id}`;
    games[chatKey][gameId] = {
        board: Array(9).fill(""),
        players: [player1Id],
        names: {},
        turn: 0
    };
    return gameId;
}

function getSymbol(turn) {
    return turn === 0 ? "X" : "O";
}

function generateBoardMarkup(board, chatId, gameId) {
    return Markup.inlineKeyboard([
        [0, 1, 2].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`)),
        [3, 4, 5].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`)),
        [6, 7, 8].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`))
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

bot.start(ctx => {
    const name = ctx.from.first_name;
    ctx.replyWithHTML(
        `<b>Welcome ${name}!</b>\n\n` +
        `This is a 2-player <b>Tic Tac Toe</b> bot.\n\n` +
        `Use <code>/tictactoe</code> in a <b>group</b> to start a game.`
    );
});

bot.command("tictactoe", ctx => {
    const chat = ctx.chat;
    const user = ctx.from;

    if (chat.type === "private") {
        return ctx.reply("❌ This command only works in groups!");
    }

    const chatId = chat.id;
    const userId = user.id;
    const chatKey = String(chatId);

    if (games[chatKey]) {
        const hasGame = Object.keys(games[chatKey]).find(id => id.startsWith("wait_") && games[chatKey][id].players[0] === userId);
        if (hasGame) {
            return ctx.reply("⚠️ You already started a game. Wait for another player to join.");
        }
    }

    const gameId = initGame(chatId, userId);
    games[chatKey][gameId].names[userId] = user.first_name;

    ctx.replyWithHTML(
        `<b>Game Created!</b>\n\n` +
        `Player <b>X</b>: ${user.first_name}\n\n` +
        `Waiting for <b>Player O</b> to join...`,
        Markup.inlineKeyboard([[Markup.button.callback("▶️ Join Game", `join_${chatId}_${userId}`)]])
    );
});

// Handle join
bot.action(/^join_(.+)_(.+)/, async ctx => {
    const [chatIdRaw, player1Id] = ctx.match.slice(1);
    const chatId = String(chatIdRaw);
    const user = ctx.from;
    const userId = user.id;

    const gameId = `wait_${player1Id}`;
    const game = games[chatId]?.[gameId];
    if (!game) return ctx.answerCbQuery("Game not found.");
    if (game.players.includes(userId)) return ctx.answerCbQuery("You already joined.");
    if (game.players.length >= 2) return ctx.answerCbQuery("Game is already full.");

    const newGameId = `${player1Id}_${userId}`;
    games[chatId][newGameId] = { ...game, players: [parseInt(player1Id), userId], names: { ...game.names, [userId]: user.first_name } };
    delete games[chatId][gameId];

    const g = games[chatId][newGameId];
    const [p1, p2] = g.players;
    const nameX = g.names[p1];
    const nameO = g.names[p2];

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
        {
            parse_mode: "HTML",
            reply_markup: generateBoardMarkup(g.board, chatId, newGameId).reply_markup
        }
    );
});

// Handle moves
bot.action(/^move_(.+)_(.+)_(\d+)/, async ctx => {
    const [chatIdRaw, gameId, cellIndexRaw] = ctx.match.slice(1);
    const chatId = String(chatIdRaw);
    const cellIndex = parseInt(cellIndexRaw);
    const userId = ctx.from.id;

    const game = games[chatId]?.[gameId];
    if (!game) return ctx.answerCbQuery("Game not found.");

    if (userId !== game.players[game.turn]) return ctx.answerCbQuery("Not your turn!");
    if (game.board[cellIndex] !== "") return ctx.answerCbQuery("Already taken!");

    const symbol = getSymbol(game.turn);
    game.board[cellIndex] = symbol;

    if (checkWinner(game.board, symbol)) {
        await ctx.editMessageText(
            `<b>Player ${symbol} (${game.names[userId]}) wins!</b>`,
            { parse_mode: "HTML" }
        );
        delete games[chatId][gameId];
        return;
    }

    if (isDraw(game.board)) {
        await ctx.editMessageText(`<b>It's a draw!</b>`, { parse_mode: "HTML" });
        delete games[chatId][gameId];
        return;
    }

    game.turn = 1 - game.turn;
    const nextPlayerId = game.players[game.turn];
    const nextName = game.names[nextPlayerId];

    await ctx.editMessageText(
        `It's <b>${nextName}</b>'s turn (${getSymbol(game.turn)})`,
        {
            parse_mode: "HTML",
            reply_markup: generateBoardMarkup(game.board, chatId, gameId).reply_markup
        }
    );
});

bot.launch();
