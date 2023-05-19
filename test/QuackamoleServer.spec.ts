import chai, {expect} from 'chai';
import sinonChai from 'sinon-chai';
// import {LaunchedChrome, launch} from "chrome-launcher";
// import CDP from "chrome-remote-interface";
import chaiHttp = require("chai-http");
import sinon from 'sinon';
import {Response} from 'superagent';
import {before} from "mocha";
import {QuackamoleServer} from "../src/_core/QuackamoleServer";


chai.use(sinonChai);
chai.use(chaiHttp);
chai.should();

describe(QuackamoleServer.name, () => {
  describe('HTTPS', () => {
    let serverHttps: QuackamoleServer;
    // let clientHttps: CDP.Client;
    // let chromeHttps: LaunchedChrome;

    before(() => process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0');

    afterEach(async () => {
      serverHttps && await serverHttps.stop();
      // chromeHttps && await chromeHttps.kill();
      // clientHttps && await clientHttps.close();
    });

    it('should verify that ssl cert and key exist before starting server', done => {
      const consoleWarnSpy = sinon.spy(console, 'warn');
      _startServerHttps('404.crt', '404.key').then(() => {
        expect(serverHttps.sslEnabled).to.eq(false);
        expect(consoleWarnSpy).to.have.been.calledOnceWith('ssl cert or key not found');
        done();
      });
    });

    it('should dynamically update example-client.html for https and custom port', done => {
      _startServerHttps('../test/localhost.crt', '../test/localhost.key', 12001).then(() => {
        chai.request('https://localhost:12001').get('/public/example-client.html').end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.have.header('content-type', 'text/html');
          expect(res.text.includes('fetch(\'https://localhost:12001\');')).to.be.true;
          expect(res.text.includes('<script src="https://localhost:12001/client"></script>')).to.be.true;
          expect(res.text.includes('http://localhost')).to.be.false;
          expect(res.text.includes('localhost:12000')).to.be.false;
          done();
        });
      });
    });

    it('should serve the client script via https', done => {
      _startServerHttps('../test/localhost.crt', '../test/localhost.key', 12001).then(() => {
        chai.request('https://localhost:12001').get('/client').end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.have.header('content-type', 'application/javascript');
          expect(res).to.have.header('content-length', String(serverHttps.getClientScript('wss://localhost:12001').length));
          done();
        });
      });
    });

    const _startServerHttps = async (cert = '', key = '', port = 12000) => {
      serverHttps && await serverHttps.stop();
      chromeHttps && await chromeHttps.kill();
      serverHttps = await new ArceServer(cert, key, port).start();
      chromeHttps = await launch({chromeFlags: ['--disable-gpu', '--headless']});
      clientHttps = await CDP({port: chromeHttps.port});
      await Promise.all([clientHttps.Network.enable({}), clientHttps.Page.enable()]);
      await clientHttps.Page.navigate({url: `http://localhost:${port}`});
      await clientHttps['Page.loadEventFired']();
    };
  });

  describe('HTTP', () => {
    let server: ArceServer;
    let client: CDP.Client;
    let chrome: LaunchedChrome;

    before(async () => await _startServer());
    afterEach(async () => await client.Page.navigate({url: 'http://localhost:12000'}));
    after(async () => {
      await server.stop();
      await chrome.kill();
      await client.close();
    });

    it('should be able to monitor server status via GET request to root url', done => {
      chai.request('http://localhost:12000').get('').end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.version).to.eq(require('../package.json').version);
        expect(res.body.clientConnected).to.eq(false);
        done();
      });
    });

    it('should serve the client script from the server from default port', done => {
      chai.request('http://localhost:12000').get('/client').end((err, res) => {
        expect(res).to.have.status(200);
        expect(res).to.have.header('content-type', 'application/javascript');
        expect(res).to.have.header('content-length', String(server.getClientScript('ws://localhost:12000').length));
        done();
      });
    });

    it('should time out when no client connects within 1s to receive command', done => {
      _sendCommandViaHTTP('({done}) => {done()}', {timeout: 0}).then(({res}) => {
        expect(res).to.have.status(408);
        expect(res.body.status).to.eq(408);
        expect(res.body.error).to.eq('No client connected in time.');
        done();
      });
    });

    it('should not time out if client connects shortly after command was sent', done => {
      _sendCommandViaHTTP(`({capture, done}) => {capture('late client'); done()}`).then(({res}) => {
        expect(res).to.have.status(200);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.captures).to.have.length(1);
        expect(res.body.captures[0]).to.eq('late client');
        done();
      });
      setTimeout(() => client.Page.navigate({url: 'http://localhost:12000/public/example'}), 500);
    });

    it('should capture sync values in order', done => {
      const script = `({capture, done}) => {capture('first'), capture('second'); done()}`;
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(script)
      .then(({res}) => {
        expect(res).to.have.status(200);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.captures).to.have.length(2);
        expect(res.body.captures[0]).to.eq('first');
        expect(res.body.captures[1]).to.eq('second');
        expect(res.body.script).to.eq(script);
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should capture async non-primitive values in order', done => {
      const script = `\
      async ({waitUntil, capture, done}) => {
        setTimeout(() => document.querySelector('button').click(), 50);
        const list = await waitUntil(() => document.querySelector('ul:not(.hidden)'));
        capture('first');
        for (const li of list.children) {
            const delayedText = await new Promise(res => setTimeout(() => res(li.innerText), 25));
            capture({ text: delayedText });
        }
        capture('last');
        done();
      }`;

      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(script)
      .then(({res}) => {
        expect(res).to.have.status(200);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.captures).to.have.length(12);
        expect(res.body.captures[0]).to.eq('first');
        expect(res.body.captures[1].text).to.eq('Item 01');
        expect(res.body.captures[2].text).to.eq('Item 02');
        expect(res.body.captures[3].text).to.eq('Item 03');
        expect(res.body.captures[4].text).to.eq('Item 04');
        expect(res.body.captures[5].text).to.eq('Item 05');
        expect(res.body.captures[6].text).to.eq('Item 06');
        expect(res.body.captures[7].text).to.eq('Item 07');
        expect(res.body.captures[8].text).to.eq('Item 08');
        expect(res.body.captures[9].text).to.eq('Item 09');
        expect(res.body.captures[10].text).to.eq('Item 10');
        expect(res.body.captures[11]).to.eq('last');
        expect(res.body.script).to.eq(script);
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should continue to capture values over time in the background after done() was called', done => {
      const script = `\
      async ({capture, done}) => {
        setTimeout(() => document.querySelector('button#fetch-something').click(), 25);
        const oldFetch = fetch;
        fetch = async (url, options) => {
          const res = await oldFetch(url, options);
          const data = await res.json();
          capture({ url: res.url, data: data, status: res.status });
          res.json = async () => new Promise(res => res(data));
          return res;
        };
        done();
      }`;

      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(script)
      .then(({res}) => {
        expect(res.body.captures).to.have.length(0);
        expect(socketSpy).to.have.callCount(1);
        setTimeout(() => {
          chai.request('http://localhost:12000').get(`/command/${res.body.awaitId}`).end((err, {body}) => {
            expect(body.captures.length).to.eq(1);
            expect(body.captures[0].url).to.eq('http://localhost:12000/');
            expect(body.captures[0].status).to.eq(200);
            expect(body.captures[0].data.version).to.eq(require('../package.json').version);
            expect(socketSpy).to.have.callCount(1);
            done();
          });
        }, 200);
      }));
    });

    it('should pass additional query params to scriptContext', done => {
      const scriptFn: ScriptFn<{ a: string, b: string, timeout: never }> = ({capture, done, scriptContext}) => {
        capture(scriptContext.a + scriptContext.b);
        capture(scriptContext.timeout);
        done();
      };
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(scriptFn.toString(), {a: 'hello', b: ' world', timeout: 1500})
      .then(({res}) => {
        expect(res.body.captures).to.have.length(2);
        expect(res.body.captures[0]).to.eq('hello world');
        expect(res.body.captures[1]).to.eq(null); // ensuring only additional params are included that are not used by server
        expect(res.body.script).to.eq(scriptFn.toString());
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should get previous command by id', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(`({capture, done}) => {capture('hello there'); done()}`)
      .then(({res}) => {
        const command: ArceCommand = res.body;
        chai.request('http://localhost:12000').get(`/command/${command.awaitId}`).end((err, res) => {
          const commandById = res.body;
          expect(commandById.awaitId).to.eq(command.awaitId);
          expect(commandById.status).to.eq(200);
          expect(commandById.script).to.eq(command.script);
          expect(commandById.captures[0]).to.eq(command.captures[0]);
          expect(socketSpy).to.have.callCount(1);
          done();
        });
      }));
    });

    it('should get command (that raised an error) by id with correct status', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(`({capture, done}) => {capture('hello there'); throw new Error('boink'); done()}`)
      .then(({res}) => {
        const command: ArceCommand = res.body;
        chai.request('http://localhost:12000').get(`/command/${command.awaitId}`).end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body.status).to.eq(400);
          expect(res.body.captures).to.have.length(1);
          expect(res.body.captures[0]).to.eq(command.captures[0]);
          expect(socketSpy).to.have.callCount(1);
          done();
        });
      }));
    });

    it('should respond with 404 when command id not found', done => {
      chai.request('http://localhost:12000').get(`/command/non-existing`).end((err, res) => {
        expect(res).to.have.status(404);
        done();
      });
    });

    it('should catch client error in command script and return it', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(`({done}) => {throw new Error('error message'); done();}`)
      .then(({res}) => {
        expect(res).to.have.status(400);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.status).to.eq(400);
        expect(res.body.error).to.eq('error message');
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should catch rejected promise and return error', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(`async ({done}) => {await new Promise((res, rej) => rej('rejected')); done();}`)
      .then(({res}) => {
        expect(res).to.have.status(400);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.status).to.eq(400);
        expect(res.body.error).to.eq('rejected');
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should catch command syntax errors before it reaches the client', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP(`() => { if }`)
      .then(({res}) => {
        expect(socketSpy).to.have.callCount(0);
        expect(res).to.have.status(400);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.status).to.eq(400);
        expect(res.body.error).to.eq('Script has syntax error: Unexpected token }');
        done();
      }));
    });

    it('should return 400 bad request if command body is empty', done => {
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => _sendCommandViaHTTP('       ')
      .then(({res}) => {
        expect(res).to.have.status(400);
        expect(res).to.have.header('content-type', 'application/json');
        expect(res.body.status).to.eq(400);
        expect(res.body.error).to.eq('Script cannot be empty.');
        expect(socketSpy).to.have.callCount(0);
        done();
      }));

      it('should be able to use server.execute() directly to trigger commands', done => {
        const scriptFn: ScriptFn = ({capture, done}) => {
          capture('first');
          capture('second');
          done();
        };
        client.Page.navigate({url: 'http://localhost:12000/public/example'})
        .then(() => _getSocketSpy())
        .then(socketSpy => server.execute(scriptFn)
        .then(command => {
          expect(command.captures).to.have.length(2);
          expect(command.captures[0]).to.eq('first');
          expect(command.captures[1]).to.eq('second');
          expect(command.script).to.eq(scriptFn);
          expect(socketSpy).to.have.callCount(1);
          done();
        }));
      });
    });

    it('should pass window object as parameter in ScriptFn ()', done => {
      const scriptFn: ScriptFn = ({capture, done, global}) => {
        // Note that the window object is always accessible. For now, it is assumed that arce client will always run in a browser runtime.
        // The reason for passing the "global" param to the ScriptFn is, mainly for better autocompletion and to avoid lint issues.
        // Also, it clearly shows the developers intent when writing/reading these scripts.
        // @ts-ignore
        monkeypatched1 = 'monkeypatched1';
        // @ts-ignore
        window.monkeypatched2 = 'monkeypatched2';
        global.monkeypatched3 = 'monkeypatched3';  // Note how this doesn't have to be ignored for linter

        // @ts-ignore
        capture(global === window);
        capture(global.monkeypatched1 === 'monkeypatched1'); // Note how this doesn't have to be ignored for linter
        // @ts-ignore
        capture(monkeypatched2 === 'monkeypatched2');
        // @ts-ignore
        capture(window.monkeypatched3 === 'monkeypatched3');
        done();
      };
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => server.execute(scriptFn)
      .then(command => {
        expect(command.captures).to.have.length(4);
        expect(command.captures.every(c => c)).to.eq(true);
        expect(command.script).to.eq(scriptFn.toString());
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    it('should pass context to script function when using execute()', done => {
      const scriptFn: ScriptFn<{ a: number, b: number }> = ({capture, done, scriptContext}) => {
        capture(scriptContext.a * 2);
        capture(scriptContext.b * 2);
        done();
      };
      client.Page.navigate({url: 'http://localhost:12000/public/example'})
      .then(() => _getSocketSpy())
      .then(socketSpy => server.execute(scriptFn, {a: 5, b: 15})
      .then(command => {
        expect(command.captures).to.have.length(2);
        expect(command.captures[0]).to.eq(10);
        expect(command.captures[1]).to.eq(30);
        expect(command.script).to.eq(scriptFn.toString());
        expect(socketSpy).to.have.callCount(1);
        done();
      }));
    });

    const _startServer = async (port = 12000) => {
      server && await server.stop();
      chrome && await chrome.kill();
      client && await client.close();
      server = await new ArceServer('', '', port).start();
      chrome = await launch({chromeFlags: ['--disable-gpu', '--headless']});
      client = await CDP({port: chrome.port});
      await Promise.all([client.Network.enable({}), client.Page.enable()]);
      await client.Page.navigate({url: `http://localhost:${port}`});
      await client['Page.loadEventFired']();
    };

    const _getSocketSpy = () => waitUntil(() => {
      // we can only spy on the socket after it was opened in headless chrome and 'openSocketHandler' was fired on server
      if (!server.client.socket) return;
      return sinon.spy(server.client.socket, 'send');
    }, 2000, 10);
  });

  const _sendCommandViaHTTP = (script: string, queryParams: ScriptContextInternal = {}): Promise<{ err: unknown, res: Response }> => new Promise(resolve => {
    chai.request(`http://localhost:12000`)
    .post('/command')
    .query(queryParams)
    .type('application/javascript')
    .send(script)
    .end((err, res) => resolve({err, res}));
  });
});
