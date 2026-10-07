"""Opt-in ciphertext mailbox. No message decryption or private messaging keys here."""
import base64
import hashlib
import json
import re
import sqlite3
import time
from contextlib import contextmanager
from functools import wraps

from cryptography.hazmat.primitives.asymmetric import ec
from eth_account import Account
from eth_account.messages import encode_defunct
from flask import Blueprint, abort, request


def canonical(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)


def binding(context, wallet, public_key):
    return canonical(['PS67 DM key v1', context, wallet.lower(), public_key])


def signed_envelope(context, data):
    return canonical(['PS67 DM message v1', context, data['id'], data['sender'],
                      data['recipient'], data['senderKey'], data['recipientKey'],
                      data['salt'], data['iv'], data['ciphertext']])


def decode(value, minimum, maximum):
    if not isinstance(value, str) or len(value) > maximum * 2:
        abort(400, 'Invalid encrypted payload.')
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        abort(400, 'Invalid encrypted payload.')
    if not minimum <= len(raw) <= maximum or base64.b64encode(raw).decode() != value:
        abort(400, 'Invalid encrypted payload.')
    return raw


def verify(wallet, message, signature):
    if not isinstance(signature, str) or not re.fullmatch(r'0x[0-9a-fA-F]{130}', signature):
        abort(400, 'A wallet signature is required.')
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception:
        abort(403, 'Invalid wallet signature.')
    if recovered.lower() != wallet.lower():
        abort(403, 'Wallet signature does not match the authenticated sender.')


def install_dm(app, *, enabled, data_dir, viewer, address, check_chain, get_chain, context):
    bp = Blueprint('dm', __name__, url_prefix='/dm')
    db_path = data_dir / 'dm.sqlite3'

    @bp.after_request
    def no_cache(response):
        response.headers['Cache-Control'] = 'no-store'
        return response

    @contextmanager
    def db():
        conn = sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    if enabled:
        with db() as conn:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS dm_keys (
                  context TEXT, wallet TEXT, public_key TEXT, key_id TEXT, signature TEXT,
                  PRIMARY KEY(context,wallet));
                CREATE TABLE IF NOT EXISTS dm_messages (
                  context TEXT, id TEXT, sender TEXT, recipient TEXT,
                  envelope TEXT, timestamp INTEGER, PRIMARY KEY(context,id));
                CREATE INDEX IF NOT EXISTS dm_participants ON dm_messages(context,sender,recipient,timestamp);
            ''')

    def protected(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not enabled:
                abort(404)
            who = viewer(True).lower()  # Always from the signed session, never a role field.
            check_chain()
            return fn(who, *args, **kwargs)
        return wrapped

    def mutual(who, peer):
        if who == peer:
            abort(400, 'Choose another wallet.')
        w3, contract = get_chain()
        block = w3.eth.block_number
        # Pin both reads to the same block. RPC errors fail closed.
        if not (contract.functions.isFollowing(address(who), address(peer)).call(block_identifier=block)
                and contract.functions.isFollowing(address(peer), address(who)).call(block_identifier=block)):
            abort(403, 'Mutual follow is required to send or fetch messages.')
        return block

    def key_record(conn, who):
        row = conn.execute('SELECT * FROM dm_keys WHERE context=? AND wallet=?', (context, who)).fetchone()
        if not row:
            abort(404, 'This wallet has not enabled encrypted messages on its device.')
        return {'wallet': row['wallet'], 'publicKey': row['public_key'],
                'keyId': row['key_id'], 'signature': row['signature'], 'context': context}

    @bp.get('/keys/<wallet>')
    @protected
    def get_key(who, wallet):
        peer = address(wallet).lower()
        if who != peer:
            mutual(who, peer)
        with db() as conn:
            return key_record(conn, peer)

    @bp.post('/keys')
    @protected
    def register(who):
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {'publicKey', 'signature'}:
            abort(400, 'Only a public messaging key and wallet signature are accepted.')
        raw = decode(data['publicKey'], 65, 65)
        try:
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
        except ValueError:
            abort(400, 'Invalid P-256 public key.')
        verify(who, binding(context, who, data['publicKey']), data['signature'])
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            old = conn.execute('SELECT public_key FROM dm_keys WHERE context=? AND wallet=?', (context, who)).fetchone()
            if old and old['public_key'] != data['publicKey']:
                abort(409, 'Another device key is registered. Key replacement is disabled in this prototype.')
            conn.execute('INSERT OR IGNORE INTO dm_keys VALUES (?,?,?,?,?)',
                         (context, who, data['publicKey'], hashlib.sha256(raw).hexdigest(), data['signature']))
            return key_record(conn, who), 201

    @bp.get('/conversations')
    @protected
    def conversations(who):
        with db() as conn:
            rows = conn.execute('''SELECT CASE WHEN sender=? THEN recipient ELSE sender END AS wallet,
                        MAX(timestamp) AS timestamp FROM dm_messages
                        WHERE context=? AND (sender=? OR recipient=?) GROUP BY wallet
                        ORDER BY timestamp DESC LIMIT 50''', (who, context, who, who)).fetchall()
        # Participant metadata only; no ciphertext or previews in this index.
        return {'conversations': [dict(r) for r in rows]}

    @bp.get('/conversations/<wallet>')
    @protected
    def conversation(who, wallet):
        peer = address(wallet).lower()
        block = mutual(who, peer)
        with db() as conn:
            keys = [key_record(conn, who), key_record(conn, peer)]
            rows = conn.execute('''SELECT envelope,timestamp FROM dm_messages WHERE context=?
                AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))
                ORDER BY timestamp DESC,id DESC LIMIT 100''', (context, who, peer, peer, who)).fetchall()
        return {'keys': keys, 'checkedBlock': block,
                'messages': [{**json.loads(r['envelope']), 'timestamp': r['timestamp']} for r in reversed(rows)]}

    @bp.post('/messages')
    @protected
    def send(who):
        data = request.get_json(silent=True)
        required = {'id', 'sender', 'recipient', 'senderKey', 'recipientKey', 'salt', 'iv', 'ciphertext', 'signature'}
        if not isinstance(data, dict) or set(data) != required:
            abort(400, 'Only a signed encrypted message envelope is accepted; role and plaintext fields are forbidden.')
        if data['sender'] != who:
            abort(403, 'Sender must match the authenticated wallet.')
        peer = address(data['recipient']).lower()
        if data['recipient'] != peer:
            abort(400, 'Recipient must use its canonical lowercase address.')
        mutual(who, peer)
        if not isinstance(data['id'], str) or not re.fullmatch(r'[0-9a-f]{32}', data['id']):
            abort(400, 'Invalid message ID.')
        decode(data['salt'], 32, 32)
        decode(data['iv'], 12, 12)
        decode(data['ciphertext'], 17, 4112)
        with db() as conn:
            sender_key, recipient_key = key_record(conn, who), key_record(conn, peer)
            if data['senderKey'] != sender_key['keyId'] or data['recipientKey'] != recipient_key['keyId']:
                abort(409, 'Messaging key mismatch.')
            verify(who, signed_envelope(context, data), data['signature'])
            stamp = time.time_ns() // 1_000_000
            try:
                conn.execute('INSERT INTO dm_messages VALUES (?,?,?,?,?,?)',
                             (context, data['id'], who, peer, canonical(data), stamp))
            except sqlite3.IntegrityError:
                abort(409, 'Message ID already exists; refresh before retrying.')
        return {'id': data['id'], 'timestamp': stamp, 'state': 'stored'}, 201

    app.register_blueprint(bp)
