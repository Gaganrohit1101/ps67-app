import { test } from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';
import { compile } from '../scripts/compile.mjs';

test('owner profile pointers and follower graph survive adds/removes correctly', async () => {
  const chain = ganache.provider({ chain: { chainId: 31337, hardfork: 'shanghai' }, logging: { quiet: true } });
  try {
    const provider = new BrowserProvider(chain);
    const [alice, bob, charlie] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));
    const artifact = compile();
    const registry = await new ContractFactory(artifact.abi, artifact.bytecode, alice).deploy();
    await registry.waitForDeployment();
    const a = await alice.getAddress(), b = await bob.getAddress(), c = await charlie.getAddress();
    await (await registry.setProfile('bafy-alice')).wait();
    await (await registry.connect(bob).setProfile('bafy-bob')).wait();
    assert.equal(await registry.profiles(a), 'bafy-alice');
    assert.equal(await registry.profiles(b), 'bafy-bob');
    await assert.rejects(registry.setProfile(''));
    await assert.rejects(registry.follow(a));
    await (await registry.connect(bob).follow(a)).wait();
    await (await registry.connect(charlie).follow(a)).wait();
    assert.equal(await registry.isFollowing(b, a), true);
    assert.deepEqual(Array.from(await registry.getFollowers(a)), [b, c]);
    await assert.rejects(registry.connect(bob).follow(a));
    await (await registry.connect(bob).unfollow(a)).wait();
    assert.deepEqual(Array.from(await registry.getFollowers(a)), [c]);
    assert.deepEqual(Array.from(await registry.getFollowing(b)), []);
    await (await registry.connect(charlie).unfollow(a)).wait();
    assert.deepEqual(Array.from(await registry.getFollowers(a)), []);
    await (await registry.connect(bob).follow(a)).wait();
    assert.deepEqual(Array.from(await registry.getFollowers(a)), [b]);
    assert.equal(await registry.profiles(a), 'bafy-alice');
  } finally { await chain.disconnect(); }
});
