import { render, screen } from '@testing-library/react';
import { App } from './App';
import { signedOut } from './test/server';

describe('App shell', () => {
  it('[AU-C-05] the real app (BrowserRouter) sends a signed-out user to the login page', async () => {
    signedOut();
    render(<App />);

    expect(await screen.findByLabelText('Coditas email')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
