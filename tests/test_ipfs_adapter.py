import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from unittest.mock import patch, MagicMock
from backend import identity

class TestIPFSAdapter(unittest.TestCase):
    def test_pinata_upload_and_read(self):
        sample_doc = {
            'schemaVersion': 1,
            'did': 'did:pkh:eip155:11155111:0x1111111111111111111111111111111111111111',
            'owner': '0x1111111111111111111111111111111111111111',
            'chainId': 11155111,
            'fields': {'displayName': {'visibility': 'public', 'value': 'Alice'}},
            'posts': []
        }
        test_cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
        
        # Test Pinata upload
        with patch.object(identity, 'PINATA_JWT', 'test_jwt'):
            mock_post = MagicMock()
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {'IpfsHash': test_cid}
            with patch('requests.post', mock_post):
                cid = identity.ipfs_add(sample_doc)
                self.assertEqual(cid, test_cid)
                mock_post.assert_called_once()
                call_args = mock_post.call_args
                self.assertIn('Bearer test_jwt', call_args[1]['headers']['Authorization'])
                self.assertEqual(call_args[1]['json']['pinataContent'], sample_doc)

            # Test Pinata read
            mock_get = MagicMock()
            mock_get.return_value.ok = True
            mock_get.return_value.iter_content.return_value = [b'{"schemaVersion": 1, "did": "test"}']
            doc = identity.ipfs_read(test_cid)
            self.assertEqual(doc, sample_doc)

            # Test Pinata health
            mock_auth = MagicMock()
            mock_auth.return_value.ok = True
            mock_auth.return_value.raise_for_status = MagicMock()
            with patch.object(identity, 'check_chain'):
                with patch('requests.get', mock_auth):
                    result, code = identity.health()
                    self.assertEqual(code, 200)
                    self.assertTrue(result['ok'])
                    self.assertTrue(result['ipfs'])
                    self.assertEqual(result['storageProvider'], 'pinata')

if __name__ == '__main__':
    unittest.main()
