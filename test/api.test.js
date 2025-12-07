const request = require('supertest');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  users: 'users.json',
  taxe: 'informationstaxe.json',
  tns: 'informationstns.json',
  immo: 'informationsimmo.json'
};

function resetFiles(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, FILES.users), JSON.stringify([], null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, FILES.taxe), JSON.stringify({}, null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, FILES.tns), JSON.stringify({}, null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, FILES.immo), JSON.stringify({}, null, 2), 'utf8');
}

beforeEach(() => {
  resetFiles();
});

describe('API security and data endpoints', () => {
  test('register -> password stored hashed and login works', async () => {
    const user = { username: 'alice', fullname: 'Alice Test', password: 'secret123' };
    const regRes = await request(app).post('/api/register').send(user).expect(200);
    expect(regRes.body.username).toBe('alice');
    expect(regRes.body.token).toBeDefined();

    // Check users.json content
    const usersRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, FILES.users), 'utf8'));
    const stored = usersRaw.find(u => u.username === 'alice');
    expect(stored).toBeDefined();
    expect(stored.password).not.toBe(user.password);
    const ok = bcrypt.compareSync(user.password, stored.password);
    expect(ok).toBe(true);

    // Login
    const loginRes = await request(app).post('/api/login').send({ login: 'alice', password: 'secret123' }).expect(200);
    expect(loginRes.body.token).toBeDefined();
  });

  test('create/get/delete year data with JWT auth', async () => {
    const user = { username: 'bob', fullname: 'Bob Test', password: 'pw' };
    const regRes = await request(app).post('/api/register').send(user).expect(200);
    const token = regRes.body.token;

    // PUT tax data for year 2025
    const year = String(new Date().getFullYear());
    const payload = { revenu: '50000', revenu_conjoint: '20000', nb_enfants: '2', nb_charge: '0' };
    await request(app)
      .put(`/api/data/taxe/${user.username}/${year}`)
      .set('Authorization', 'Bearer ' + token)
      .send(payload)
      .expect(200);

    // GET the year
    const getRes = await request(app)
      .get(`/api/data/taxe/${user.username}/${year}`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(getRes.body.revenu).toBe('50000');

    // Delete the year
    await request(app)
      .delete(`/api/data/taxe/${user.username}/${year}`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    // GET again -> empty
    const getRes2 = await request(app)
      .get(`/api/data/taxe/${user.username}/${year}`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(Object.keys(getRes2.body).length).toBe(0);
  });

  test('forbidden when accessing other user data', async () => {
    // register two users
    const a = await request(app).post('/api/register').send({ username: 'u1', fullname: 'U1', password: 'p1' }).expect(200);
    const b = await request(app).post('/api/register').send({ username: 'u2', fullname: 'U2', password: 'p2' }).expect(200);

    // u1 tries to write to u2 -> should be forbidden
    const year = String(new Date().getFullYear());
    await request(app)
      .put(`/api/data/taxe/u2/${year}`)
      .set('Authorization', 'Bearer ' + a.body.token)
      .send({ revenu: '1' })
      .expect(403);
  });

  test('pagination on /api/users', async () => {
    // create 30 users
    for(let i=0;i<30;i++){
      await request(app).post('/api/register').send({ username: `us${i}`, fullname: `U${i}`, password: 'x' });
    }
    // login with one user to get token
    const login = await request(app).post('/api/login').send({ login: 'us0', password: 'x' }).expect(200);
    const token = login.body.token;

    const res = await request(app)
      .get('/api/users?page=2&limit=10')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(res.body.data.length).toBe(10);
  });
});