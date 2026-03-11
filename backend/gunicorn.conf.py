import multiprocessing

# Bind
bind = "0.0.0.0:8000"

# Workers — recommended: (2 * CPU cores) + 1
workers = multiprocessing.cpu_count() * 2 + 1

# Worker class
worker_class = "sync"

# Timeout (seconds) — kill worker if request takes longer
timeout = 120

# Graceful timeout (seconds)
graceful_timeout = 30

# Keep-alive (seconds)
keepalive = 5

# Max requests per worker before restart (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Preload app for faster worker startup
preload_app = True
