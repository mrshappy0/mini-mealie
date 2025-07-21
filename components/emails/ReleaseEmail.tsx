import { Body, Container, Head, Heading, Html, Link, Text } from '@react-email/components';
import React from 'react';

export interface ReleaseEmailProps {
    tag: string;
    items: string[];
}

export function ReleaseEmail({ tag, items }: ReleaseEmailProps) {
    return (
        <Html>
            <Head />
            <Body style={{ fontFamily: 'sans-serif', lineHeight: 1.6, color: '#333' }}>
                <Container style={{ padding: '20px' }}>
                    <Heading as="h1" style={{ fontSize: '24px' }}>
                        🚀 Mini Mealie {tag} Released!
                    </Heading>

                    <Text style={{ fontSize: '16px', margin: '16px 0' }}>
                        Here’s what’s new in this release:
                    </Text>

                    <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
                        {items.map((line, i) => (
                            <li key={i} style={{ marginBottom: '8px' }}>
                                <Text style={{ fontSize: '15px', margin: 0 }}>{line}</Text>
                            </li>
                        ))}
                    </ul>

                    <Text style={{ marginBottom: '16px' }}>
                        We’d love your input! Whether it&apos;s reporting a bug, requesting a
                        improving Mini Mealie with a pull request:
                    </Text>

                    <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
                        <li>
                            <Link href="https://github.com/mrshappy0/mini-mealie/issues">
                                Report issues →
                            </Link>
                        </li>
                        <li>
                            <Link href="https://github.com/mrshappy0/mini-mealie/discussions">
                                Join discussions →
                            </Link>
                        </li>
                        <li>
                            <Link href="https://github.com/mrshappy0/mini-mealie/pulls">
                                Contribute via pull request →
                            </Link>
                        </li>
                    </ul>

                    <Text>
                        <Link href="https://chromewebstore.google.com/detail/mini-mealie/lchfnbjpjoeejalacnpjnafenacmdocc">
                            View on Chrome Web Store →
                        </Link>
                    </Text>

                    <Container
                        style={{
                            marginTop: '30px',
                            borderTop: '1px solid #ccc',
                            paddingTop: '10px',
                        }}
                    >
                        <Text style={{ fontSize: '12px', color: '#999' }}>
                            If you wish to unsubscribe, click here:{' '}
                            <Link href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</Link>
                        </Text>
                    </Container>
                </Container>
            </Body>
        </Html>
    );
}
