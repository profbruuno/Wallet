/(async () => {
  // State management
  let solanaWeb3 = null;
  let connection = null;
  let wallet = null;
  let tokens = [];
  let currentNetwork = localStorage.getItem('network') || 'devnet';
  const importedTokens = JSON.parse(localStorage.getItem('importedTokens') || '[]');
  const tokenMetadataCache = JSON.parse(localStorage.getItem('tokenMetadataCache') || '{}');
  
  // UI Elements
  const statusEl = document.getElementById("status");
  const menuButtons = document.querySelectorAll('.menu-button');
  const pages = document.querySelectorAll('.page');
  
  // Home page elements
  const walletAddressEl = document.getElementById('wallet-address');
  const currentNetworkEl = document.getElementById('current-network');
  const solBalanceEl = document.getElementById('sol-balance');
  const tokensContainerEl = document.getElementById('tokens-container');
  const tokenAddressInput = document.getElementById('token-address-input');
  const importTokenBtn = document.getElementById('btn-import-token');
  const refreshTokensBtn = document.getElementById('btn-refresh-tokens');
  
  // Settings page elements
  const networkRadios = document.querySelectorAll('input[name="network"]');
  const saveNetworkBtn = document.getElementById('btn-save-network');
  const networkStatusEl = document.getElementById('network-status');
  const btnGen = document.getElementById("btn-gen");
  const secretOut = document.getElementById("secret-out");
  const secretIn = document.getElementById("secret-in");
  const btnImport = document.getElementById("btn-import");
  const addressOut = document.getElementById("address-out");
  
  // Set status message
  const setStatus = (msg, isError = false) => {
    statusEl.textContent = msg;
    statusEl.className = isError ? "status error" : "status ok";
  };
  
  // Switch between pages
  menuButtons.forEach(button => {
    button.addEventListener('click', () => {
      const pageId = button.getAttribute('data-page');
      
      // Update active button
      menuButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Show active page
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(`${pageId}-page`).classList.add('active');
    });
  });
  
  // bs58 implementation
  const bs58 = {
    alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    encode: function(input) {
      let output = '';
      let num = BigInt(0);
      const base = BigInt(58);
      
      // Convert Uint8Array to big integer
      for (let i = 0; i < input.length; i++) {
        num = num * BigInt(256) + BigInt(input[i]);
      }
      
      // Convert to base58
      while (num > 0) {
        const remainder = Number(num % base);
        output = this.alphabet[remainder] + output;
        num = num / base;
      }
      
      // Add leading '1's for each leading zero byte
      for (let i = 0; i < input.length; i++) {
        if (input[i] === 0) {
          output = '1' + output;
        } else {
          break;
        }
      }
      
      return output;
    },
    decode: function(input) {
      let num = BigInt(0);
      const base = BigInt(58);
      
      // Convert base58 string to big integer
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const index = this.alphabet.indexOf(char);
        if (index === -1) throw new Error('Invalid base58 character: ' + char);
        num = num * base + BigInt(index);
      }
      
      // Convert big integer to bytes
      const bytes = [];
      while (num > 0) {
        bytes.unshift(Number(num % BigInt(256)));
        num = num / BigInt(256);
      }
      
      // Add leading zeros
      for (let i = 0; i < input.length; i++) {
        if (input[i] === '1') {
          bytes.unshift(0);
        } else {
          break;
        }
      }
      
      return new Uint8Array(bytes);
    }
  };
  
  // Parse secret key input (base58 or JSON array)
  function parseSecret(raw) {
    const txt = (raw || "").trim();
    if (!txt) throw new Error("Secret key is empty.");
    if (txt.startsWith("[")) {
      const arr = JSON.parse(txt);
      const bytes = Uint8Array.from(arr);
      if (bytes.length !== 64) throw new Error("JSON array must be 64 bytes.");
      return bytes;
    }
    const decoded = bs58.decode(txt);
    if (decoded.length !== 64) throw new Error("Base58 key must decode to 64 bytes.");
    return decoded;
  }
  
  // Get token metadata from known token list
  async function getTokenMetadata(mintAddress) {
    // Check cache first
    if (tokenMetadataCache[mintAddress]) {
      return tokenMetadataCache[mintAddress];
    }
    
    // Known tokens on Solana
    const knownTokens = {
      // Mainnet tokens
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USD Coin', symbol: 'USDC' },
      'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', symbol: 'WSOL' },
      'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': { name: 'Serum', symbol: 'SRM' },
      '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E': { name: 'Wrapped Bitcoin', symbol: 'BTC' },
      '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk': { name: 'Ethereum', symbol: 'ETH' },
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { name: 'Raydium', symbol: 'RAY' },
      'AR1Mtgh7zAtxuxGd2XPovXPVjcSdY3i4rQYisNadjfKy': { name: 'Saber', symbol: 'SBR' },
      'PoRTjZMPXb9T7dyU7tpLEZRQj7e6ssfAE62j2oQuc6y': { name: 'Port Finance', symbol: 'PORT' },
      'MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K': { name: 'Mercurial', symbol: 'MER' },
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'Tether', symbol: 'USDT' },
      
      // Devnet tokens (example)
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { name: 'USD Coin (Devnet)', symbol: 'USDC' }
    };
    
    // Check if it's a known token
    if (knownTokens[mintAddress]) {
      const metadata = knownTokens[mintAddress];
      
      // Update cache
      tokenMetadataCache[mintAddress] = metadata;
      localStorage.setItem('tokenMetadataCache', JSON.stringify(tokenMetadataCache));
      
      return metadata;
    }
    
    // If not known, try to get metadata from on-chain
    try {
      const { PublicKey } = solanaWeb3;
      const mintPublicKey = new PublicKey(mintAddress);
      const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
      
      if (mintInfo.value && mintInfo.value.data) {
        const parsedData = mintInfo.value.data.parsed.info;
        const metadata = {
          name: parsedData.name || 'Unknown Token',
          symbol: parsedData.symbol || 'UNKNOWN',
          mint: mintAddress
        };
        
        // Update cache
        tokenMetadataCache[mintAddress] = metadata;
        localStorage.setItem('tokenMetadataCache', JSON.stringify(tokenMetadataCache));
        
        return metadata;
      }
    } catch (onChainError) {
      console.error('Error fetching on-chain metadata:', onChainError);
    }
    
    // Return default metadata if not available
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      mint: mintAddress
    };
  }
  
  // Initialize connection based on selected network
  function initConnection() {
    if (!solanaWeb3) return;
    const { Connection } = solanaWeb3;
    
    // Use multiple RPC endpoints for better reliability
    const rpcUrls = currentNetwork === 'mainnet' 
      ? [
          "https://api.mainnet-beta.solana.com",
          "https://solana-api.projectserum.com",
          "https://ssc-dao.genesysgo.net"
        ]
      : [
          "https://api.devnet.solana.com",
          "https://devnet.genesysgo.net"
        ];
    
    // Try each RPC endpoint until one works
    const tryConnection = async (urls, index = 0) => {
      if (index >= urls.length) {
        setStatus("All RPC endpoints failed. Please check your network connection.", true);
        return null;
      }
      
      try {
        const testConnection = new Connection(urls[index], "confirmed");
        // Test the connection
        await testConnection.getEpochInfo();
        return testConnection;
      } catch (error) {
        console.warn(`RPC endpoint ${urls[index]} failed:`, error);
        return tryConnection(urls, index + 1);
      }
    };
    
    tryConnection(rpcUrls).then(conn => {
      if (conn) {
        connection = conn;
        
        // Update UI
        currentNetworkEl.textContent = currentNetwork;
        currentNetworkEl.className = `network-badge ${currentNetwork}`;
        
        // Update settings UI
        document.querySelector(`input[name="network"][value="${currentNetwork}"]`).checked = true;
        
        setStatus(`Connected to ${currentNetwork} via ${conn.rpcEndpoint}`);
        
        // Refresh data if wallet is connected
        if (wallet) {
          updateBalance();
          updateTokens();
        }
      }
    });
  }
  
  // Set wallet from secret key
  function setWallet(secretKey) {
    if (!solanaWeb3) return;
    const { Keypair } = solanaWeb3;
    
    try {
      wallet = Keypair.fromSecretKey(secretKey);
      const address = wallet.publicKey.toBase58();
      
      // Update UI
      addressOut.textContent = address;
      walletAddressEl.textContent = address;
      
      // Save to localStorage
      localStorage.setItem('secretKey', bs58.encode(secretKey));
      
      setStatus("Wallet imported successfully");
      updateBalance();
      updateTokens();
    } catch (e) {
      console.error(e);
      setStatus("Error importing wallet: " + e.message, true);
    }
  }
  
  // Update SOL balance
  async function updateBalance() {
    if (!connection || !wallet) return;
    
    try {
      const lamports = await connection.getBalance(wallet.publicKey, 'confirmed');
      const solBalance = lamports / solanaWeb3.LAMPORTS_PER_SOL;
      solBalanceEl.textContent = `${solBalance.toFixed(6)} SOL`;
    } catch (e) {
      console.error(e);
      setStatus("Error updating balance: " + e.message, true);
    }
  }
  
  // Update tokens list with retry logic
  async function updateTokens() {
    if (!connection || !wallet || !solanaWeb3) return;
    
    try {
      setStatus("Loading tokens...");
      
      const { PublicKey } = solanaWeb3;
      const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Token fetch timeout")), 15000);
      });
      
      const tokenPromise = connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID
      });
      
      const resp = await Promise.race([tokenPromise, timeoutPromise]);
      
      tokens = [];
      for (const { account } of resp.value) {
        const info = account.data.parsed.info;
        const uiAmount = info.tokenAmount.uiAmount;
        
        if (uiAmount && uiAmount > 0) {
          // Get token metadata
          const metadata = await getTokenMetadata(info.mint);
          
          tokens.push({
            mint: info.mint,
            amount: info.tokenAmount.uiAmountString,
            symbol: metadata.symbol || (info.mint.slice(0, 4) + '...' + info.mint.slice(-4)),
            name: metadata.name || 'Unknown Token'
          });
        }
      }
      
      // Add imported tokens even if balance is 0
      for (const tokenAddress of importedTokens) {
        if (!tokens.some(t => t.mint === tokenAddress)) {
          const metadata = await getTokenMetadata(tokenAddress);
          tokens.push({
            mint: tokenAddress,
            amount: '0',
            symbol: metadata.symbol || (tokenAddress.slice(0, 4) + '...' + tokenAddress.slice(-4)),
            name: metadata.name || 'Unknown Token'
          });
        }
      }
      
      renderTokens();
      setStatus("Tokens updated successfully");
    } catch (e) {
      console.error(e);
      setStatus("Error updating tokens: " + e.message + ". Please try again or check your network connection.", true);
    }
  }
  
  // Render tokens to UI
  function renderTokens() {
    tokensContainerEl.innerHTML = '';
    
    if (tokens.length === 0) {
      tokensContainerEl.innerHTML = '<div class="muted">No tokens found</div>';
      return;
    }
    
    tokens.forEach(token => {
      const tokenEl = document.createElement('div');
      tokenEl.className = 'token-card';
      tokenEl.innerHTML = `
        <div class="token-symbol">${token.symbol}</div>
        <div class="token-name">${token.name}</div>
        <div class="token-balance">${token.amount}</div>
        <div class="token-mint">${token.mint}</div>
      `;
      tokensContainerEl.appendChild(tokenEl);
    });
  }
  
  // Import token by contract address
  async function importToken(tokenAddress) {
    if (!tokenAddress) return;
    
    try {
      const { PublicKey } = solanaWeb3;
      // Validate the address
      new PublicKey(tokenAddress);
      
      if (!importedTokens.includes(tokenAddress)) {
        importedTokens.push(tokenAddress);
        localStorage.setItem('importedTokens', JSON.stringify(importedTokens));
      }
      
      setStatus("Token imported successfully");
      updateTokens();
    } catch (e) {
      console.error(e);
      setStatus("Invalid token address: " + e.message, true);
    }
  }
  
  // Save network selection
  function saveNetwork() {
    const selectedNetwork = document.querySelector('input[name="network"]:checked').value;
    
    if (selectedNetwork !== currentNetwork) {
      currentNetwork = selectedNetwork;
      localStorage.setItem('network', currentNetwork);
      networkStatusEl.textContent = `Network changed to ${currentNetwork}.`;
      
      // Reinitialize connection
      initConnection();
    } else {
      networkStatusEl.textContent = 'Network unchanged.';
    }
  }
  
  // Event listeners
  btnGen.addEventListener("click", () => {
    try {
      const kp = nacl.sign.keyPair();
      secretOut.textContent = bs58.encode(kp.secretKey);
      setStatus("Secret key generated");
    } catch (e) {
      console.error(e);
      setStatus("Generation failed: " + e.message, true);
    }
  });
  
  btnImport.addEventListener("click", () => {
    try {
      const secretBytes = parseSecret(secretIn.value);
      setWallet(secretBytes);
    } catch (e) {
      console.error(e);
      setStatus("Error: " + e.message, true);
    }
  });
  
  importTokenBtn.addEventListener("click", () => {
    importToken(tokenAddressInput.value.trim());
    tokenAddressInput.value = '';
  });
  
  saveNetworkBtn.addEventListener("click", saveNetwork);
  
  refreshTokensBtn.addEventListener("click", updateTokens);
  
  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    // Check for saved wallet
    const savedSecretKey = localStorage.getItem('secretKey');
    if (savedSecretKey) {
      try {
        const secretBytes = bs58.decode(savedSecretKey);
        setWallet(secretBytes);
        secretIn.value = savedSecretKey;
      } catch (e) {
        console.error("Error loading saved wallet:", e);
        localStorage.removeItem('secretKey');
      }
    }
    
    // Set solanaWeb3
    solanaWeb3 = window.solanaWeb3;
    if (solanaWeb3) {
      setStatus("Libraries loaded — ready");
      initConnection();
    } else {
      setStatus("Error loading Solana library", true);
    }
  });
})();