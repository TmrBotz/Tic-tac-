const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const express = require('express');

const TOKEN = '7473136514:AAHaXM7b19fMf1MjYnz8lFc0mPBIAmO0FkM'; // Replace with your actual bot token
const bot = new Telegraf(TOKEN);

// Express web server for Render to ping
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Tic Tac Toe Bot is running!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function getBoardPath(chatId) {
    return `board_${chatId}.json`;
}

function resetBoard(chatId) {
    const board = ["", "", "", "", "", "", "", "", ""];
    fs.writeFileSync(getBoardPath(chatId), JSON.stringify(board));
}

function saveBoard(chatId, board) {
    fs.writeFileSync(getBoardPath(chatId), JSON.stringify(board));
}

function loadBoard(chatId) {
    const path = getBoardPath(chatId);
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path));
    }
    return ["", "", "", "", "", "", "", "", ""];
}

function generateKeyboard(board) {
    const buttons = board.map((val, idx) => Markup.button.callback(val || '.', String(idx)));
    return Markup.inlineKeyboard([
        buttons.slice(0, 3),
        buttons.slice(3, 6),
        buttons.slice(6, 9)
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

function isBoardFull(board) {
    return board.every(cell => cell !== "");
}

function findWinningMove(board, player) {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (const combo of wins) {
        const playerCount = combo.filter(i => board[i] === player).length;
        const emptyIndex = combo.find(i => board[i] === "");
        if (playerCount === 2 && emptyIndex !== undefined) return emptyIndex;
    }
    return null;
}

function botMove(board) {
    let move = findWinningMove(board, "O");
    if (move !== null) return board[move] = "O";

    move = findWinningMove(board, "X");
    if (move !== null) return board[move] = "O";

    if (board[4] === "") return board[4] = "O";

    for (const i of [0,2,6,8]) if (board[i] === "") return board[i] = "O";
    for (const i of [1,3,5,7]) if (board[i] === "") return board[i] = "O";
}

bot.start(ctx => {
    const chatId = ctx.chat.id;
    resetBoard(chatId);
    ctx.reply("Let's play Tic Tac Toe! You are X, bot is O.", generateKeyboard(loadBoard(chatId)));
});

bot.on('callback_query', async ctx => {
    const chatId = ctx.chat.id;
    const board = loadBoard(chatId);
    const index = parseInt(ctx.callbackQuery.data);

    if (board[index] !== "") {
        await ctx.answerCbQuery("Already taken!");
        return;
    }

    board[index] = "X";

    if (checkWinner(board, "X")) {
        await ctx.editMessageText("You win!");
        resetBoard(chatId);
        return;
    }

    if (isBoardFull(board)) {
        await ctx.editMessageText("It's a draw!");
        resetBoard(chatId);
        return;
    }

    botMove(board);

    if (checkWinner(board, "O")) {
        await ctx.editMessageText("Bot wins!");
        resetBoard(chatId);
        return;
    }

    if (isBoardFull(board)) {
        await ctx.editMessageText("It's a draw!");
        resetBoard(chatId);
        return;
    }

    saveBoard(chatId, board);
    await ctx.editMessageText("Tic Tac Toe", generateKeyboard(board));
});

// Launch the bot
bot.launch();
