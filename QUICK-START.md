# Quick Start Deployment Guide

If you're new to server deployment, follow these simplified steps:

## Before You Start

You'll need:
1. **Hostinger VPS** - Any VPS plan will work
2. **Domain name** - Either buy from Hostinger or use an existing one
3. **Shopify Partner Account** - To get your API credentials

## Step-by-Step Process

### 1. Access Your Server (5 minutes)

1. Log into Hostinger
2. Go to VPS section
3. Click on your VPS
4. Find your:
   - **IP Address** (e.g., 203.0.113.45)
   - **SSH Access** details
5. Use an SSH client:
   - **Windows**: Download PuTTY or use Windows Terminal
   - **Mac/Linux**: Use Terminal

Connect:
```bash
ssh root@your-vps-ip
```

Enter your root password when prompted.

### 2. Run the Setup Script (15 minutes)

Copy and paste this entire command block:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Install Nginx
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# Install PM2
npm install -g pm2

# Install Git
apt install -y git

# Install Certbot for SSL
apt install -y certbot python3-certbot-nginx

echo "✅ Server setup complete!"
```

### 3. Setup Database (5 minutes)

```bash
# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE jaldicod;
CREATE USER jaldicod_user WITH PASSWORD 'ChangeThisToSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE jaldicod TO jaldicod_user;
\q
EOF

echo "✅ Database created!"
```

### 4. Create App User (2 minutes)

```bash
# Create user for the app
adduser jaldicod
# Enter a password when prompted
# Press Enter for all other questions

# Give sudo access
usermod -aG sudo jaldicod

# Switch to jaldicod user
su - jaldicod
```

### 5. Deploy Your App (10 minutes)

You have two options:

#### Option A: Using Git (Recommended)

```bash
cd ~
git clone https://github.com/your-username/jaldi-cod-form.git
cd jaldi-cod-form
```

#### Option B: Upload Files via SFTP

1. Download FileZilla or WinSCP
2. Connect to your server:
   - Host: your-vps-ip
   - Username: jaldicod
   - Password: (password you created)
   - Port: 22
3. Upload your project folder to `/home/jaldicod/jaldi-cod-form`

Then:
```bash
cd ~/jaldi-cod-form
```

### 6. Configure Environment (5 minutes)

```bash
# Copy example env file
cp .env.example .env

# Edit the file
nano .env
```

Update these values:
- `SHOPIFY_API_KEY`: From Shopify Partner Dashboard
- `SHOPIFY_API_SECRET`: From Shopify Partner Dashboard
- `SHOPIFY_APP_URL`: Your domain (e.g., https://jaldicod.yourdomain.com)
- `HOST`: Same as SHOPIFY_APP_URL
- `DATABASE_URL`: Replace `your_secure_password_here` with the password from step 3
- `SESSION_SECRET`: Generate one with `openssl rand -base64 32`

Press `Ctrl+O` to save, `Enter` to confirm, `Ctrl+X` to exit.

### 7. Install and Build (5 minutes)

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate deploy

# Build the app
npm run build
```

### 8. Start with PM2 (2 minutes)

```bash
# Create logs directory
mkdir -p logs

# Start app
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save

# Enable PM2 on startup
pm2 startup
```

The last command will show you a command to run as root. Copy it, then:

```bash
# Exit jaldicod user
exit

# Paste and run the command PM2 showed you (as root)
# It will look something like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u jaldicod --hp /home/jaldicod
```

### 9. Configure Nginx (5 minutes)

```bash
# Copy nginx config
sudo cp /home/jaldicod/jaldi-cod-form/nginx.conf /etc/nginx/sites-available/jaldicod

# Edit to add your domain
sudo nano /etc/nginx/sites-available/jaldicod
```

Replace `jaldicod.yourdomain.com` with your actual domain (do this in 2 places).

Press `Ctrl+O` to save, `Enter`, `Ctrl+X` to exit.

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/jaldicod /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 10. Setup SSL Certificate (3 minutes)

```bash
# Get SSL certificate
sudo certbot --nginx -d jaldicod.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to Terms of Service (press 'Y')
- Share email? (your choice)
- Redirect HTTP to HTTPS? Press '2' for Yes (recommended)

### 11. Configure DNS (Variable time)

Go to your domain registrar or Hostinger DNS panel:

1. Add A Record:
   - **Type**: A
   - **Name**: jaldicod (or your subdomain)
   - **Value**: Your VPS IP address
   - **TTL**: 3600 or Auto

2. Wait 5-30 minutes for DNS to propagate

### 12. Update Shopify App Settings (2 minutes)

Go to Shopify Partner Dashboard:

1. Navigate to: Apps → Your App → Configuration
2. Update these URLs:
   - **App URL**: `https://jaldicod.yourdomain.com`
   - **Allowed redirection URL(s)**: Add these lines:
     ```
     https://jaldicod.yourdomain.com/auth/callback
     https://jaldicod.yourdomain.com/auth/shopify/callback
     https://jaldicod.yourdomain.com/api/auth/callback
     ```
3. Click Save

### 13. Test Your App! 🎉

Open your browser and go to: `https://jaldicod.yourdomain.com`

You should see your Shopify app login screen!

## Common Issues & Solutions

### "Cannot connect to server"
- Check if app is running: `pm2 status`
- View logs: `pm2 logs jaldicod`
- Restart: `pm2 restart jaldicod`

### "502 Bad Gateway"
- App might be starting up, wait 30 seconds
- Check PM2 logs: `pm2 logs jaldicod --lines 50`
- Make sure port 3000 is not used by another app

### "SSL Certificate Error"
- Make sure DNS is propagated (check: `ping jaldicod.yourdomain.com`)
- Re-run certbot: `sudo certbot --nginx -d jaldicod.yourdomain.com`

### "Database Connection Error"
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify database credentials in `.env` file
- Test connection: `psql -U jaldicod_user -d jaldicod -h localhost`

## Useful Commands

```bash
# View app status
pm2 status

# View real-time logs
pm2 logs jaldicod

# Restart app
pm2 restart jaldicod

# Stop app
pm2 stop jaldicod

# Check Nginx status
sudo systemctl status nginx

# Check database
sudo systemctl status postgresql

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Updating Your App

When you make changes and want to deploy:

```bash
cd ~/jaldi-cod-form
chmod +x deploy.sh  # First time only
./deploy.sh
```

## Getting Help

If something isn't working:

1. Check PM2 logs: `pm2 logs jaldicod --lines 100`
2. Check Nginx logs: `sudo tail -100 /var/log/nginx/error.log`
3. Verify environment variables: `cat ~/jaldi-cod-form/.env`
4. Test database: `psql -U jaldicod_user -d jaldicod -h localhost` (password from .env)

## Next Steps

- Setup automatic backups (see DEPLOYMENT.md)
- Configure monitoring
- Setup staging environment
- Add firewall rules (UFW)

---

**Congratulations! Your Shopify app is now live! 🚀**

Access it at: `https://jaldicod.yourdomain.com`
