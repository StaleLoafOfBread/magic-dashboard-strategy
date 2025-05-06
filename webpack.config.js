const CopyPlugin = require("copy-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const glob = require("glob");



module.exports = (env, argv) => {
  const mode = process.env.NODE_ENV || argv.mode || "development";
  console.log("Webpack mode: ", mode);

  return {
    entry: glob.sync("./src/**/*.js", { posix: true, dotRelative: true }),
    mode,
    output: {
      filename: "magic-dashboard-strategy.js",
    },
    plugins: [
      new CopyPlugin({
        patterns: [{ from: "src/**/*.css", to: "[name][ext]" }],
      }),
    ],
    optimization: {
      minimize: mode === 'production',
      minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
    },
  };
}
