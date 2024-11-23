enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

type LoggerConfig = {
  level: LogLevel;
  service?: string;
};

export class Logger {
  private level: LogLevel;
  private service: string;

  constructor(config: LoggerConfig) {
    this.level = config.level;
    this.service = config.service || "app";
  }

  private formatMessage(level: string, message: string, meta?: object): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level} ${this.service}: ${message}${metaStr}`;
  }

  debug(message: string, meta?: object) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage("DEBUG", message, meta));
    }
  }

  info(message: string, meta?: object) {
    if (this.level <= LogLevel.INFO) {
      console.info(this.formatMessage("INFO", message, meta));
    }
  }

  warn(message: string, meta?: object) {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage("WARN", message, meta));
    }
  }

  error(message: string, error?: Error | unknown, meta?: object) {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage("ERROR", message, meta));
      if (error instanceof Error) {
        console.error(error.stack);
      }
    }
  }

  child(service: string): Logger {
    return new Logger({
      level: this.level,
      service: `${this.service}:${service}`,
    });
  }
}

// Create default logger instance
export const logger = new Logger({
  level: process.env.LOG_LEVEL === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
});
