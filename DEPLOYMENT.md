# Deploying Jaldi COD Form App to Hostinger

This guide will walk you through deploying your Shopify app to Hostinger VPS with SSL, Nginx, and PM2.

## Prerequisites

- Hostinger VPS account with SSH access
- Domain name (e.g., `jaldicod.yourdomain.com`)
- Node.js 20.x or higher
- PostgreSQL database

## Step 1: Initial Server Setup

### 1.1 Connect to your Hostinger VPS via SSH

```bash
ssh root@your-vps-ip
```

### 1.2 Update system packages

```bash
apt update && apt upgrade -y
```

### 1.3 Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # Should show v20.x
npm --version
```

### 1.4 Install PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
```

### 1.5 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE DATABASE jaldicod;
CREATE USER jaldicod_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE jaldicod TO jaldicod_user;
\q
```

### 1.6 Install Nginx

```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### 1.7 Install PM2 globally

```bash
npm install -g pm2
```

### 1.8 Install Git

```bash
apt install -y git
```

## Step 2: Setup Application

### 2.1 Create app user (recommended for security)

```bash
adduser jaldicod
usermod -aG sudo jaldicod
su - jaldicod
```

### 2.2 Clone your repository

```bash
cd ~
git clone https://github.com/your-username/jaldi-cod-form.git
cd jaldi-cod-form
```

Or upload files via SFTP to `/home/jaldicod/jaldi-cod-form`

### 2.3 Install dependencies

```bash
npm install
```

### 2.4 Create production environment file

```bash
nano .env
```

Add the following (replace with your actual values):

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SCOPES=write_products,write_orders,write_customers

# App URLs (replace with your domain)
SHOPIFY_APP_URL=https://jaldicod.yourdomain.com
HOST=https://jaldicod.yourdomain.com

# Database
DATABASE_URL=postgresql://jaldicod_user:your_secure_password_here@localhost:5432/jaldicod

# Session Storage
SESSION_SECRET=generate_random_32_character_string_here

# Node Environment
NODE_ENV=production
```

Generate a secure SESSION_SECRET:
```bash
openssl rand -base64 32
```

### 2.5 Setup Database

```bash
npx prisma generate
npx prisma migrate deploy
```

### 2.6 Build the application

```bash
npm run build
```

## Step 3: Configure PM2

### 3.1 Create PM2 ecosystem file

```bash
nano ecosystem.config.js
```

Copy the content from the `ecosystem.config.js` file in your project root.

### 3.2 Start the application with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

The last command will output a command - copy and run it as root to enable PM2 on system startup.

### 3.3 Check application status

```bash
pm2 status
pm2 logs jaldicod
```

## Step 4: Configure Nginx

### 4.1 Create Nginx configuration

```bash
sudo nano /etc/nginx/sites-available/jaldicod
```

Copy the content from the `nginx.conf` file in your project.

### 4.2 Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/jaldicod /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Step 5: Setup SSL with Let's Encrypt

### 5.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 Obtain SSL certificate

```bash
sudo certbot --nginx -d jaldicod.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### 5.3 Test SSL auto-renewal

```bash
sudo certbot renew --dry-run
```

Certbot will automatically renew your certificate before it expires.

## Step 6: Configure Shopify App

### 6.1 Update your Shopify App URLs

Go to your Shopify Partner Dashboard:
1. Navigate to Apps > Your App > Configuration
2. Update URLs:
   - **App URL**: `https://jaldicod.yourdomain.com`
   - **Allowed redirection URL(s)**:
     - `https://jaldicod.yourdomain.com/auth/callback`
     - `https://jaldicod.yourdomain.com/auth/shopify/callback`
     - `https://jaldicod.yourdomain.com/api/auth/callback`

## Step 7: Configure DNS

In your domain registrar (or Hostinger DNS panel):

1. Add an A record:
   - **Name**: `jaldicod` (or your subdomain)
   - **Type**: A
   - **Value**: Your VPS IP address
   - **TTL**: 3600

2. Wait for DNS propagation (can take up to 48 hours, usually 5-30 minutes)

## Step 8: Verify Deployment

### 8.1 Check if app is running

```bash
pm2 status
pm2 logs jaldicod --lines 50
```

### 8.2 Test the application

Open your browser and navigate to:
```
https://jaldicod.yourdomain.com
```

You should see your Shopify app.

### 8.3 Test installation

Try installing the app on a development store to ensure everything works.

## Common PM2 Commands

```bash
# View logs
pm2 logs jaldicod

# Restart app
pm2 restart jaldicod

# Stop app
pm2 stop jaldicod

# View detailed info
pm2 info jaldicod

# Monitor resources
pm2 monit
```

## Updating Your App

When you need to deploy updates:

```bash
cd ~/jaldi-cod-form
git pull origin main
npm install
npm run build
npx prisma migrate deploy  # If there are database changes
pm2 restart jaldicod
```

## Firewall Configuration (Optional but Recommended)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## Backup Strategy

### Database Backup

Create a backup script:

```bash
nano ~/backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/backups"
mkdir -p $BACKUP_DIR

pg_dump -U jaldicod_user jaldicod > $BACKUP_DIR/jaldicod_$DATE.sql
find $BACKUP_DIR -type f -mtime +7 -delete  # Keep only last 7 days

echo "Backup completed: jaldicod_$DATE.sql"
```

Make it executable and add to crontab:

```bash
chmod +x ~/backup-db.sh
crontab -e
```

Add this line to run daily backups at 2 AM:
```
0 2 * * * /home/jaldicod/backup-db.sh
```

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs jaldicod

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart PM2
pm2 restart jaldicod
```

### Database connection errors

```bash
# Test database connection
psql -U jaldicod_user -d jaldicod -h localhost

# Check PostgreSQL is running
sudo systemctl status postgresql
```

### Nginx errors

```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew
```

## Security Best Practices

1. **Keep system updated**: Run `apt update && apt upgrade` regularly
2. **Use strong passwords**: For database and SSH
3. **Setup SSH key authentication**: Disable password login
4. **Configure firewall**: Use UFW as shown above
5. **Regular backups**: Automated daily backups
6. **Monitor logs**: Check PM2 and Nginx logs regularly
7. **Update dependencies**: Keep Node.js packages updated

## Performance Optimization

### Enable Nginx Caching

Add to your Nginx config inside the `server` block:

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### PM2 Cluster Mode

For better performance, use PM2 cluster mode:

```bash
pm2 start ecosystem.config.js --env production -i max
```

This will use all available CPU cores.

## Monitoring

### Setup PM2 Monitoring (Optional)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs jaldicod`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify environment variables: `pm2 env 0`
4. Check database connection: Test with `psql`

---

**Deployment Checklist:**

- [ ] Server updated and secured
- [ ] Node.js 20.x installed
- [ ] PostgreSQL installed and configured
- [ ] Nginx installed
- [ ] PM2 installed globally
- [ ] Application code deployed
- [ ] Dependencies installed
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Application built
- [ ] PM2 configured and app started
- [ ] Nginx configured
- [ ] SSL certificate obtained
- [ ] DNS configured
- [ ] Shopify app URLs updated
- [ ] Firewall configured
- [ ] Backups configured
- [ ] Application tested and verified

**Your app should now be live at `https://jaldicod.yourdomain.com`!**
