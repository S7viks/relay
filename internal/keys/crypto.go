package keys

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
)

// Encrypt encrypts plaintext with AES-GCM using the key from GAIOL_ENCRYPTION_KEY (32-byte hex).
// Returns hex-encoded nonce+ciphertext, or error if key is missing/invalid.
func Encrypt(plaintext []byte) (string, error) {
	key, err := getEncryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts hex-encoded nonce+ciphertext produced by Encrypt.
func Decrypt(hexCiphertext string) ([]byte, error) {
	key, err := getEncryptionKey()
	if err != nil {
		return nil, err
	}
	ciphertext, err := hex.DecodeString(hexCiphertext)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func getEncryptionKey() ([]byte, error) {
	hexKey := os.Getenv("GAIOL_ENCRYPTION_KEY")
	if hexKey == "" {
		return nil, errors.New("GAIOL_ENCRYPTION_KEY is not set")
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, errors.New("GAIOL_ENCRYPTION_KEY must be 32-byte hex (64 hex chars)")
	}
	if len(key) != 32 {
		return nil, errors.New("GAIOL_ENCRYPTION_KEY must be 32 bytes (64 hex chars)")
	}
	return key, nil
}
