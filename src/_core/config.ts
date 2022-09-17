import path from 'path';
import dotenv from 'dotenv';

// Based on: https://dev.to/asjadanis/parsing-env-with-typescript-3jjm
// Parsing the env file.
dotenv.config({path: path.resolve(__dirname, '../.env')});

// Interface to load env variables
// Note these variables can possibly be undefined
// as someone could skip these variables or not set up a .env file at all
interface ENV {
  NODE_ENV: string | undefined;
  PORT: number | undefined;
  BCRYPT_SALT: number | undefined;
  JWT_SECRET: string | undefined;

  SSL_ENABLED: boolean | undefined;
  SSL_CERT: string | undefined;
  SSL_KEY: string | undefined;
}


interface Config {
  NODE_ENV: string;
  PORT: number;
  BCRYPT_SALT: number;
  JWT_SECRET: string;

  SSL_ENABLED: boolean;
  SSL_CERT: string;
  SSL_KEY: string;
}


// Loading process.env as ENV interface

const getConfig = (): ENV => ({
  NODE_ENV: process.env.NODE_ENV,
  PORT: Number(process.env.PORT) || undefined,
  BCRYPT_SALT: Number(process.env.BCRYPT_SALT) || undefined,
  JWT_SECRET: process.env.JWT_SECRET || undefined,
  SSL_ENABLED: process.env.SSL_ENABLED ? process.env.SSL_ENABLED === 'true' : undefined,
  SSL_CERT: process.env.SSL_CERT || undefined,
  SSL_KEY: process.env.SSL_KEY || undefined,
});

// Throwing an Error if any field was undefined we don't
// want our app to run if it can't connect to DB and ensure
// that these fields are accessible. If all is good return
// it as Config which just removes the undefined from our type
// definition.

const getSanitzedConfig = (config: ENV): Config => {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      throw new Error(`Missing key ${key} in config.env`);
    }
  }
  return config as Config;
};

const config = getConfig();

const sanitizedConfig = getSanitzedConfig(config);

export default sanitizedConfig;
