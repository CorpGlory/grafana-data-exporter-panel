const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

function resolve (dir) {
  return path.join(__dirname, '..', dir)
}

module.exports = {
  entry: './test/module.js',
  output: {
    path: __dirname + '/../dist-test',
    filename: 'module.js'
  },
  resolve: {
    alias: {
      'src': resolve('src')
    }
  },
  plugins: [
    new CopyWebpackPlugin([
      { from: 'test/module.html' }
    ])
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(external)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env']
          }
        }
      }
    ]
  }
}