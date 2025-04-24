const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const TOKEN = '7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU';
const bot = new Telegraf(TOKEN);

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot Running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const games = {}; // chatId => { gameId => game }

function createGame(chatId, player1Id) {
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

function getBoardMarkup(board, chatId, gameId) {
    return Markup.inlineKeyboard([
        [0, 1, 2].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`)),
        [3, 4, 5].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`)),
        [6, 7, 8].map(i => Markup.button.callback(board[i] || ".", `move_${chatId}_${gameId}_${i}`))
    ]);
}

function checkWinner(board, symbol) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    return wins.some(pattern => pattern.every(i => board[i] === symbol));
}

function isDraw(board) {
    return board.every(cell => cell !== "");
}

// Start command
bot.start(ctx => {
    const name = ctx.from.first_name;
    ctx.replyWithHTML(
        `<b>Welcome ${name}!</b>\n\n` +
        `This is a 2-player <b>Tic Tac Toe</b> game bot.\n\n` +
        `Use <code>/tictactoe</code> in a <b>group</b> to start playing!`
    );
});

// /tictactoe command (only in groups)
bot.command('tictactoe', ctx => {
    const chat = ctx.chat;
    const user = ctx.from;

    if (chat.type === 'private') {
        return ctx.reply("❌ Use this command in a group to play.");
    }

    const chatId = String(chat.id);
    const userId = user.id;

    // Check for ongoing waiting game by same user
    if (games[chatId]) {
        const existing = Object.keys(games[chatId]).find(id => id.startsWith("wait_") && games[chatId][id].players[0] === userId);
        if (existing) {
            return ctx.reply("⚠️ You already started a game. Wait for someone to join.");
        }
    }

    const gameId = createGame(chatId, userId);
    games[chatId][gameId].names[userId] = user.first_name;

    ctx.replyWithHTML(
        `<b>Game Created!</b>\n\n` +
        `Player <b>X</b>: ${user.first_name}\n\n` +
        `Waiting for <b>Player O</b> to join...`,
        Markup.inlineKeyboard([[Markup.button.callback("▶️ Join Game", `join_${chatId}_${userId}`)]])
    );
});

// Join button
bot.action(/^join_(.+)_(.+)/, async ctx => {
    const [chatIdRaw, player1Id] = ctx.match.slice(1);
    const chatId = String(chatIdRaw);
    const user = ctx.from;
    const userId = user.id;

    const gameId = `wait_${player1Id}`;
    const waitingGame = games[chatId]?.[gameId];

    if (!waitingGame) return ctx.answerCbQuery("Game not found.");
    if (waitingGame.players.includes(userId)) return ctx.answerCbQuery("You already joined.");
    if (waitingGame.players.length >= 2) return ctx.answerCbQuery("Game already full.");

    const newGameId = `${player1Id}_${userId}`;
    games[chatId][newGameId] = {
        ...waitingGame,
        players: [parseInt(player1Id), userId],
        names: {
            ...waitingGame.names,
            [userId]: user.first_name
        }
    };

    delete games[chatId][gameId];

    const game = games[chatId][newGameId];
    const [p1, p2] = game.players;

    await ctx.editMessageText(
        `<b>Game Started!</b>\n\n` +
        `Player <b>X</b>: ${game.names[p1]}\n` +
        `Player <b>O</b>: ${game.names[p2]}\n\n` +
        `It's <b>${game.names[p1]}</b>'s turn (X)`,
        { parse_mode: "HTML" }
    );

    await ctx.telegram.sendMessage(
        chatId,
        `It's <b>${game.names[p1]}</b>'s turn (X)`,
        {
            parse_mode: "HTML",
            reply_markup: getBoardMarkup(game.board, chatId, newGameId).reply_markup
        }
    );
});

// Move handler
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
            `<b>${symbol} (${game.names[userId]}) wins!</b>`,
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
    const nextPlayer = game.players[game.turn];
    await ctx.editMessageText(
        `It's <b>${game.names[nextPlayer]}</b>'s turn (${getSymbol(game.turn)})`,
        {
            parse_mode: "HTML",
            reply_markup: getBoardMarkup(game.board, chatId, gameId).reply_markup
        }
    );
});

bot.launch();
