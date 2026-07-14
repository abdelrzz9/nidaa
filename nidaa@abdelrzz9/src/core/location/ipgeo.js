import Soup from 'gi://Soup';

const LOG_PREFIX = '[Nidaa:Location:IPGeo]';
const API_URL = 'https://ipwho.is/';

export async function resolveViaIP(cancellable = null) {
  const session = new Soup.Session();
  const message = Soup.Message.new('GET', API_URL);

  try {
    const bytes = await session.send_and_read_async(
      message,
      Soup.MessagePriority.NORMAL,
      cancellable
    );

    if (message.get_status() !== Soup.Status.OK) {
      throw new Error(`HTTP ${message.get_status()}: ${message.get_reason_phrase()}`);
    }

    const decoder = new TextDecoder();
    const raw = decoder.decode(bytes.toArray() || bytes.get_data());
    const data = JSON.parse(raw);

    if (!data || !data.success) {
      throw new Error(`API error: ${raw}`);
    }

    const latitude = data.latitude;
    const longitude = data.longitude;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error(`Invalid coordinates from API: lat=${latitude}, lng=${longitude}`);
    }

    console.log(
      `${LOG_PREFIX} resolved via ipwho.is: ${latitude}, ${longitude} ` +
      `(${data.city}, ${data.country})`
    );

    return {
      latitude,
      longitude,
      source: 'ip',
      timestamp: Date.now(),
    };
  } catch (err) {
    console.log(`${LOG_PREFIX} failed: ${err.message || err}`);
    return null;
  }
}
