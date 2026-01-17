#!/usr/bin/env bash
#
# Donut CLI - Quick Setup Script
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-donut/donut-cli/main/scripts/setup.sh | bash
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ASCII Art
print_banner() {
    echo -e "${CYAN}"
    echo "    ╔═══════════════════════════════════════════════════════════╗"
    echo "    ║   ██████╗  ██████╗ ███╗   ██╗██╗   ██╗████████╗           ║"
    echo "    ║   ██╔══██╗██╔═══██╗████╗  ██║██║   ██║╚══██╔══╝           ║"
    echo "    ║   ██║  ██║██║   ██║██╔██╗ ██║██║   ██║   ██║              ║"
    echo "    ║   ██║  ██║██║   ██║██║╚██╗██║██║   ██║   ██║              ║"
    echo "    ║   ██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝   ██║              ║"
    echo "    ║   ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝    ╚═╝              ║"
    echo "    ║                                                           ║"
    echo "    ║          AI-Powered Crypto Trading Terminal               ║"
    echo "    ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_step() {
    echo -e "${BLUE}==>${NC} ${BOLD}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check for required commands
check_dependencies() {
    log_step "Checking dependencies..."

    local missing=()

    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_success "Node.js $(node -v)"
        else
            log_error "Node.js 18+ required (found $(node -v))"
            missing+=("node")
        fi
    else
        log_error "Node.js not found"
        missing+=("node")
    fi

    # Check Bun (preferred) or npm
    if command -v bun &> /dev/null; then
        log_success "Bun $(bun -v)"
        PKG_MANAGER="bun"
    elif command -v npm &> /dev/null; then
        log_warning "Bun not found, using npm (Bun recommended for faster installs)"
        PKG_MANAGER="npm"
    else
        log_error "Neither Bun nor npm found"
        missing+=("bun or npm")
    fi

    # Check git
    if command -v git &> /dev/null; then
        log_success "Git $(git --version | cut -d' ' -f3)"
    else
        log_error "Git not found"
        missing+=("git")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo ""
        log_error "Missing dependencies: ${missing[*]}"
        echo ""
        echo "Install missing dependencies:"
        echo "  - Node.js 18+: https://nodejs.org/"
        echo "  - Bun: curl -fsSL https://bun.sh/install | bash"
        echo "  - Git: https://git-scm.com/"
        exit 1
    fi

    echo ""
}

# Clone or update repository
setup_repository() {
    log_step "Setting up repository..."

    if [ -d "donut-cli" ]; then
        log_warning "donut-cli directory exists, updating..."
        cd donut-cli
        git pull origin main 2>/dev/null || true
    else
        git clone https://github.com/chris-donut/donut-cli.git
        cd donut-cli
        log_success "Cloned repository"
    fi

    echo ""
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."

    if [ "$PKG_MANAGER" = "bun" ]; then
        bun install
    else
        npm install
    fi

    log_success "Dependencies installed"
    echo ""
}

# Setup environment
setup_environment() {
    log_step "Configuring environment..."

    if [ -f ".env" ]; then
        log_warning ".env file exists, checking configuration..."

        if grep -q "^ANTHROPIC_API_KEY=sk-ant-" .env; then
            log_success "API key already configured"
            return 0
        fi
    else
        cp .env.example .env
        log_success "Created .env from template"
    fi

    # Check if running interactively
    if [ -t 0 ]; then
        echo ""
        echo -e "${YELLOW}An Anthropic API key is required for AI features.${NC}"
        echo "Get one at: https://console.anthropic.com/settings/keys"
        echo ""
        read -p "Enter your API key (or press Enter to skip): " API_KEY

        if [ -n "$API_KEY" ]; then
            # Update or add the API key
            if grep -q "^ANTHROPIC_API_KEY=" .env; then
                sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY|" .env
                rm -f .env.bak
            else
                echo "ANTHROPIC_API_KEY=$API_KEY" >> .env
            fi
            log_success "API key configured"
        else
            log_warning "Skipped API key setup (demo mode will still work)"
        fi
    else
        log_warning "Non-interactive mode: Set ANTHROPIC_API_KEY in .env manually"
    fi

    echo ""
}

# Build the project
build_project() {
    log_step "Building project..."

    if [ "$PKG_MANAGER" = "bun" ]; then
        bun run build
    else
        npm run build
    fi

    log_success "Build complete"
    echo ""
}

# Setup global command
setup_global_command() {
    log_step "Setting up 'donut' command..."

    if [ -t 0 ]; then
        read -p "Install 'donut' command globally? [Y/n] " INSTALL_GLOBAL
        INSTALL_GLOBAL=${INSTALL_GLOBAL:-Y}

        if [[ "$INSTALL_GLOBAL" =~ ^[Yy]$ ]]; then
            npm link 2>/dev/null || sudo npm link
            log_success "Installed globally - use 'donut' from anywhere"
        else
            log_warning "Skipped global install - use 'node dist/index.js' or run 'npm link' later"
        fi
    else
        log_warning "Run 'npm link' to install 'donut' command globally"
    fi

    echo ""
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."

    if [ -f "dist/index.js" ]; then
        log_success "CLI built successfully"
    else
        log_error "Build failed - dist/index.js not found"
        exit 1
    fi

    # Run demo tour as verification
    echo ""
    echo -e "${CYAN}Running quick verification...${NC}"
    node dist/index.js demo tour --quick 2>/dev/null || node dist/index.js demo tour 2>/dev/null || true

    echo ""
}

# Print next steps
print_next_steps() {
    echo -e "${GREEN}${BOLD}Setup complete!${NC}"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo ""

    if command -v donut &> /dev/null; then
        echo "  donut demo tour     # Interactive demo"
        echo "  donut chat          # AI chat mode"
        echo "  donut paper start   # Start paper trading"
    else
        echo "  node dist/index.js demo tour     # Interactive demo"
        echo "  node dist/index.js chat          # AI chat mode"
        echo "  node dist/index.js paper start   # Start paper trading"
    fi

    echo ""
    echo -e "${BOLD}Configuration:${NC}"
    echo ""
    echo "  Edit .env to configure:"
    echo "  - ANTHROPIC_API_KEY   # Required for AI features"
    echo "  - HUMMINGBOT_URL      # Optional: Live trading backend"
    echo "  - NOFX_API_URL        # Optional: Backtesting server"
    echo ""
    echo -e "${BOLD}Documentation:${NC}"
    echo ""
    echo "  README.md                 # Overview"
    echo "  docs/INSTALLATION.md      # Detailed setup"
    echo "  docs/CLI_REFERENCE.md     # All commands"
    echo ""
    echo -e "${CYAN}Happy trading!${NC}"
}

# Main
main() {
    print_banner

    echo -e "${BOLD}Donut CLI Quick Setup${NC}"
    echo ""

    check_dependencies
    setup_repository
    install_dependencies
    setup_environment
    build_project
    setup_global_command
    verify_installation
    print_next_steps
}

# Run if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
