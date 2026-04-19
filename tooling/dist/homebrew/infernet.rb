# Homebrew formula for the Infernet CLI.
#
# Distribution pipeline:
#   1. Release @infernetprotocol/cli to npm (via the workspace at apps/cli).
#   2. Run tooling/dist/homebrew/update-formula.mjs <version> which
#      downloads the npm tarball, hashes it, and rewrites the url +
#      sha256 + version fields in this file.
#   3. Copy this file into the Infernet Homebrew tap repo and push.
#
# Users install with:
#   brew tap profullstack/infernet
#   brew install infernet
class Infernet < Formula
  desc "GPU node control plane for the Infernet Protocol"
  homepage "https://github.com/profullstack/infernet-protocol"
  url "https://registry.npmjs.org/@infernetprotocol/cli/-/cli-0.0.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  version "0.0.0"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/infernet"]
  end

  test do
    output = shell_output("#{bin}/infernet help")
    assert_match "GPU node control plane for the Infernet Protocol", output
  end
end
