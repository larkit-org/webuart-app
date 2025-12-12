export function hexToUint8Array(hexString: string): Uint8Array {
  const hex = hexString.replace(/\s/g, '')
  return new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  )
}

export function formatHexInput(input: string): string {
  const cleanHex = input.replace(/[^0-9A-Fa-f]/g, '')
  return cleanHex.replace(/.{2}/g, '$& ').trim()
}

export function validateAndFormatHex(hexString: string): string {
  let cleanHex = hexString.replace(/\s/g, '')

  if (!/^[0-9A-Fa-f]*$/.test(cleanHex)) {
    throw new Error('Invalid HEX format')
  }

  if (cleanHex.length % 2 !== 0) {
    cleanHex = '0' + cleanHex
  }

  return cleanHex
}
