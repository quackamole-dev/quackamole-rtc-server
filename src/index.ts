#!/usr/bin/env node
import yargs from 'yargs';
import { QuackamoleServer } from './QuackamoleServer';

const argv = yargs(process.argv.slice(2)).options({
  ssl_cert: { type: 'string', default: '', describe: 'ssl certificate' },
  ssl_key: { type: 'string', default: '', describe: 'ssl key' },
  port: { type: 'number', default: 12000, describe: 'port' },
}).parseSync();

new QuackamoleServer(argv.ssl_cert, argv.ssl_key, argv.port).start();
