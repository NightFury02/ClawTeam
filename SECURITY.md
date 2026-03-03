# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of ClawTeam seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do Not

- **Do not** open a public GitHub issue for security vulnerabilities
- **Do not** disclose the vulnerability publicly until it has been addressed

### How to Report

**Email**: Send details to [INSERT SECURITY EMAIL]

**Include**:
- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### What to Expect

1. **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
2. **Assessment**: We will assess the vulnerability and determine its impact and severity
3. **Fix Development**: We will work on a fix and keep you informed of progress
4. **Release**: We will release a patch and publicly disclose the vulnerability
5. **Credit**: We will credit you in the security advisory (unless you prefer to remain anonymous)

### Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Release**: Depends on severity
  - Critical: Within 7 days
  - High: Within 30 days
  - Medium: Within 90 days
  - Low: Next regular release

## Security Best Practices

### For Users

#### Environment Variables

- **Never commit `.env` files** to version control
- **Use strong secrets** for `JWT_SECRET`, `API_KEY_SALT`, and database passwords
- **Rotate secrets regularly** in production environments
- **Use different secrets** for development, staging, and production

#### Database Security

- **Use strong passwords** for PostgreSQL
- **Restrict database access** to only necessary services
- **Enable SSL/TLS** for database connections in production
- **Regular backups** with encryption

#### API Security

- **Use HTTPS** in production (never HTTP)
- **Implement rate limiting** to prevent abuse
- **Validate all input** to prevent injection attacks
- **Use API keys** for authentication, not passwords

#### Docker Security

- **Don't run containers as root** (use non-root users)
- **Keep images updated** to patch vulnerabilities
- **Scan images** for vulnerabilities regularly
- **Use secrets management** for sensitive data (Docker secrets, Kubernetes secrets)

#### Network Security

- **Use firewalls** to restrict access to services
- **Expose only necessary ports** to the internet
- **Use VPN or SSH tunnels** for remote access
- **Enable CORS** only for trusted origins

### For Developers

#### Code Security

- **Validate all user input** to prevent injection attacks
- **Use parameterized queries** to prevent SQL injection
- **Sanitize output** to prevent XSS attacks
- **Implement proper authentication** and authorization
- **Use HTTPS** for all external API calls

#### Dependency Security

- **Keep dependencies updated** to patch known vulnerabilities
- **Run `npm audit`** regularly to check for vulnerabilities
- **Use `npm audit fix`** to automatically fix vulnerabilities
- **Review dependency changes** before updating

#### Secret Management

- **Never hardcode secrets** in source code
- **Use environment variables** for configuration
- **Use secret management tools** (HashiCorp Vault, AWS Secrets Manager, etc.)
- **Rotate secrets regularly**

#### Testing

- **Write security tests** for authentication and authorization
- **Test input validation** with malicious input
- **Test rate limiting** and throttling
- **Perform security audits** before major releases

## Known Security Considerations

### API Keys

- API keys are hashed using SHA-256 with a salt before storage
- Keys are prefixed with `clawteam_` for easy identification
- Keys should be treated as passwords and never shared

### JWT Tokens

- JWT tokens are used for session management
- Tokens expire after a configurable period (default: 24 hours)
- Tokens should be stored securely (httpOnly cookies or secure storage)

### WebSocket Connections

- WebSocket connections require authentication via JWT token
- Connections are automatically closed on token expiration
- Rate limiting is applied to prevent abuse

### Database Access

- Database credentials should never be exposed to clients
- Use connection pooling to prevent connection exhaustion
- Implement query timeouts to prevent DoS attacks

### File Uploads

- ClawTeam does not currently support file uploads
- If implementing file uploads, validate file types and sizes
- Scan uploaded files for malware

## Security Updates

Security updates will be announced via:
- GitHub Security Advisories
- Release notes
- CHANGELOG.md

Subscribe to repository notifications to stay informed about security updates.

## Compliance

ClawTeam is designed to be deployed in various environments, including:
- On-premises data centers
- Cloud environments (, Azure, GCP)
- Air-gapped/offline environments

Users are responsible for ensuring their deployment meets their organization's security and compliance requirements.

## Third-Party Security

ClawTeam integrates with third-party services:
- **PostgreSQL**: Database security is the user's responsibility
- **Redis**: Cache security is the user's responsibility
- **OpenClaw**: Session security follows OpenClaw's security model

Refer to each service's security documentation for best practices.

---

**Last Updated**: 2026-03-03
