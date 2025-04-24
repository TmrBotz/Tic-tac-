const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const app = express();

const bot = new Telegraf('7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU');
const games = {}; // Stores game state per game ID (chatID + messageID)

function generateBoard(board, gameId) {
  return Markup.inlineKeyboard(
    board.map((cell, i) =>
      Markup.button.callback(cell || '⬜', `${gameId}:${i}`)
    , 3)
  );
}

function createEmptyBoard() {
  return Array(9).fill('');
}

function checkWinner(board, symbol) {
  const win = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  return win.some(comb => comb.every(i => board[i] === symbol));
}

function isFull(board) {
  return board.every(cell => cell !== '');
}

bot.start(ctx => {
  ctx.replyWithHTML(`<b>Welcome!</b>\nUse /tictactoe to start a game in a group.`);
});

bot.command('tictactoe', async (ctx) => {
  if (ctx.chat.type === 'private') return ctx.reply('Use this command in a group chat.');
  
  const chatId = ctx.chat.id;
  const message = await ctx.replyWithHTML(`<b>Waiting for another player...</b>`, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('Join Game', `join:${chatId}:${ctx.from.id}`)]
    ])
  });
  
  const gameId = `${chatId}:${message.message_id}`;
  games[gameId] = {
    board: createEmptyBoard(),
    players: [ctx.from.id],
    turn: 0,
    message_id: message.message_id
  };
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith('join:')) {
    const [_, chatId, player1] = data.split(':');
    const gameId = `${chatId}:${ctx.callbackQuery.message.message_id}`;
    const game = games[gameId];

    if (!game || game.players.length === 2) {
      return ctx.answerCbQuery('Game already started or not available.');
    }

    if (ctx.from.id == player1) {
      return ctx.answerCbQuery('You cannot join your own game.');
    }

    game.players.push(ctx.from.id);

    await ctx.editMessageText(
      `Game Started!\n${ctx.from.first_name} vs ${ctx.from.id == game.players[0] ? 'You' : 'Opponent'}`,
      generateBoard(game.board, gameId)
    );

  } else if (data.includes(':')) {
    const [gameId, index] = data.split(':');
    const game = games[gameId];

    if (!game || game.players.length < 2) {
      return ctx.answerCbQuery('Game not started.');
    }

    const userId = ctx.from.id;
    if (userId !== game.players[game.turn]) {
      return ctx.answerCbQuery('Not your turn!');
    }

    if (game.board[index] !== '') {
      return ctx.answerCbQuery('Already taken!');
    }

    const symbol = game.turn === 0 ? '❌' : '⭕';
    game.board[index] = symbol;

    if (checkWinner(game.board, symbol)) {
      await ctx.editMessageText(
        `🏆 ${ctx.from.first_name} wins!`,
        generateBoard(game.board, gameId)
      );
      delete games[gameId];
      return;
    }

    if (isFull(game.board)) {
      await ctx.editMessageText('It\'s a draw!', generateBoard(game.board, gameId));
      delete games[gameId];
      return;
    }

    game.turn = 1 - game.turn;

    await ctx.editMessageReplyMarkup(generateBoard(game.board, gameId).reply_markup);
  }

  ctx.answerCbQuery();
});
