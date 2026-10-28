'use client';

import { FormEvent, useState } from 'react';

type EnquiryStep = 'phone' | 'otp' | 'message' | 'done';

export function EnquiryCta({ productName }: { productName: string }) {
  const [step, setStep] = useState<EnquiryStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setNotice('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setNotice('Demo preview: enter any 6 digits. No SMS will be sent.');
    setStep('otp');
  }

  function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setNotice('Enter a 6-digit OTP to continue.');
      return;
    }
    setNotice('');
    setStep('message');
  }

  function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < 10) {
      setNotice('Add a few details so the supplier understands your requirement.');
      return;
    }
    setNotice('');
    setStep('done');
  }

  return (
    <section className="enquiry-panel" id="enquiry">
      {step === 'phone' && <>
        <div className="enquiry-heading"><div><span className="section-kicker">Connect with the supplier</span><h2>Request a quote</h2></div><span className="enquiry-step">01 <i /> 03</span></div>
        <p>Start an enquiry for <strong>{productName}</strong> with your mobile number.</p>
        <form className="enquiry-form" onSubmit={sendOtp}>
          <label htmlFor="enquiry-mobile">Mobile number</label>
          <div className="mobile-input"><span>🇮🇳 +91</span><input id="enquiry-mobile" name="mobile" type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} required /></div>
          <button className="button button-primary" type="submit">Continue with OTP <span>→</span></button>
        </form>
        {notice && <p className="enquiry-notice" role="status">{notice}</p>}
        <small className="privacy-note">Demo only: OTP delivery and enquiry storage are not connected.</small>
      </>}
      {step === 'otp' && <>
        <div className="enquiry-heading"><div><span className="section-kicker">Mobile verification</span><h2>Enter your OTP</h2></div><span className="enquiry-step">02 <i /> 03</span></div>
        <p>Verify <strong>+91 {phone}</strong> to continue your enquiry.</p>
        <form className="enquiry-form enquiry-form-stack" onSubmit={verifyOtp}>
          <label htmlFor="enquiry-otp">6-digit one-time password</label>
          <div className="mobile-input"><input id="enquiry-otp" name="otp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="Enter any 6 digits for this demo" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></div>
          <button className="button button-primary" type="submit">Verify & continue <span>→</span></button>
          <button className="enquiry-back" type="button" onClick={() => { setNotice(''); setStep('phone'); }}>Change mobile number</button>
        </form>
        {notice && <p className="enquiry-notice" role="status">{notice}</p>}
        <small className="privacy-note">Demo flow · no SMS is sent.</small>
      </>}
      {step === 'message' && <>
        <div className="enquiry-heading"><div><span className="section-kicker">Your requirement</span><h2>Tell us what you need</h2></div><span className="enquiry-step">03 <i /> 03</span></div>
        <p>Share the quantity, specifications or delivery timeline for <strong>{productName}</strong>.</p>
        <form className="enquiry-form enquiry-form-stack" onSubmit={submitEnquiry}>
          <label htmlFor="enquiry-message">Enquiry details</label>
          <textarea id="enquiry-message" rows={3} minLength={10} placeholder="For example: Please share your quote for 100 units..." value={message} onChange={(event) => setMessage(event.target.value)} required />
          <button className="button button-primary" type="submit">Submit enquiry <span>→</span></button>
        </form>
        {notice && <p className="enquiry-notice" role="status">{notice}</p>}
        <small className="privacy-note">Preview only: this enquiry stays in your browser and is not sent.</small>
      </>}
      {step === 'done' && <div className="enquiry-success" role="status"><span>✓</span><div><h2>Enquiry ready</h2><p>Your demo enquiry for {productName} is complete. Connect an OTP service and backend to deliver it to the supplier.</p></div></div>}
    </section>
  );
}
