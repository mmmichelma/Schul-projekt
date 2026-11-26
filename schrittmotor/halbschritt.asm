; =====================================================================
;  Schrittmotor im Halbschrittbetrieb
;
;  C0 -> T1 -> S1 -> Hauptschalter   (gedrueckt = Motor laeuft)
;  C1 -> T2 -> S2 -> Rechtsbetrieb   (gedrueckt = rechts, sonst links)
;  PortB (Bit 0..3) -> Motor (z.B. ueber ULN2003)
;  PortD (Bit 0..1) -> LEDs: zeigen S1 / S2 an
;
;  Controller: ATmega8, 1 MHz  (AVR-Werkstatt)
;  Motor: 28BYJ-48 bipolar an L293D: PB0=A1, PB1=A2, PB2=B1, PB3=B2
; =====================================================================

.def temp    = r18
.def counter = r19              ; ein gesetztes Bit = aktueller Halbschritt (1..8)
.def phase   = r20              ; Bitmuster fuer die Motorspulen
.def ledreg  = r21

.org 0x0000
        rjmp main

main:
        ldi temp, HIGH(RAMEND)  ; Stackpointer setzen (fuer rcall noetig)
        out SPH, temp
        ldi temp, LOW(RAMEND)
        out SPL, temp

        ldi temp, 0b00000000
        out DDRC, temp          ; PortC auf Eingang
        ldi temp, 0b11111111
        out PORTC, temp         ; PortC Pullups an
        out DDRB, temp          ; PortB auf Ausgang (Motor)
        out DDRD, temp          ; PortD auf Ausgang (LEDs)

        ldi counter, 0b00000001 ; Counter -> Schritt 1
        ldi phase,   0b00000000 ; Motor aus
        out PORTB, phase

mainloop:
        rcall led               ; Tasterzustand auf LEDs anzeigen

        sbic PINC, 0            ; T1 gedrueckt (Low)? -> naechsten Befehl ueberspringen
        rjmp motor_aus          ; T1 nicht gedrueckt -> Motor stromlos, warten

        sbic PINC, 1            ; T2 gedrueckt? -> Rechtsbetrieb
        rjmp links              ; T2 nicht gedrueckt -> Linksbetrieb

rechts:
        lsl counter             ; naechster Halbschritt (1 -> 2 -> ... -> 8)
        brne stepper            ; Counter noch nicht 0 -> Schritt ausgeben
        ldi counter, 0b00000001 ; nach Schritt 8 wieder bei Schritt 1 anfangen
        rjmp stepper

links:
        lsr counter             ; vorheriger Halbschritt (8 -> 7 -> ... -> 1)
        brne stepper
        ldi counter, 0b10000000 ; nach Schritt 1 wieder bei Schritt 8 anfangen
        rjmp stepper

motor_aus:
        ldi phase, 0b00000000   ; alle Spulen aus (Motor wird nicht heiss)
        out PORTB, phase
        rcall Wait2ms
        rjmp mainloop

; ---------------------------------------------------------------------
;  Halbschritt-Tabelle: Bit n im Counter gesetzt -> Schritt n+1
; ---------------------------------------------------------------------
stepper:
        sbrc counter, 0         ; Wenn Bit 0 gesetzt
        ldi phase, 0b00000001   ; dann Schritt 1

        sbrc counter, 1         ; Wenn Bit 1 gesetzt
        ldi phase, 0b00000101   ; dann Schritt 2

        sbrc counter, 2         ; Wenn Bit 2 gesetzt
        ldi phase, 0b00000100   ; dann Schritt 3

        sbrc counter, 3         ; Wenn Bit 3 gesetzt
        ldi phase, 0b00000110   ; dann Schritt 4

        sbrc counter, 4         ; Wenn Bit 4 gesetzt
        ldi phase, 0b00000010   ; dann Schritt 5

        sbrc counter, 5         ; Wenn Bit 5 gesetzt
        ldi phase, 0b00001010   ; dann Schritt 6

        sbrc counter, 6         ; Wenn Bit 6 gesetzt
        ldi phase, 0b00001000   ; dann Schritt 7

        sbrc counter, 7         ; Wenn Bit 7 gesetzt
        ldi phase, 0b00001001   ; dann Schritt 8

        out PORTB, phase        ; Schreibe Phase in den Motor

        rcall Wait2ms           ; Wartezeit zwischen zwei Halbschritten
        rjmp mainloop           ; Wiederhole

; ---------------------------------------------------------------------
;  LEDs: LED0 = S1 gedrueckt, LED1 = S2 gedrueckt
; ---------------------------------------------------------------------
led:
        ldi ledreg, 0b00000000

        sbis PINC, 0            ; T1 gedrueckt (Pin = 0)?
        ori ledreg, 0b00000001  ; dann LED 0 an

        sbis PINC, 1            ; T2 gedrueckt (Pin = 0)?
        ori ledreg, 0b00000010  ; dann LED 1 an

        out PORTD, ledreg
        ret

; ---------------------------------------------------------------------
;  Wartezeit ca. 2 ms bei 1 MHz  (10 * 50 * 4 Takte = 2000 Takte)
;  -> 4096 Halbschritte pro Umdrehung * 2 ms = ca. 8 s pro Umdrehung
;  Groesserer Wert bei r25 -> Motor dreht langsamer
; ---------------------------------------------------------------------
Wait2ms:
        push r24
        push r25
        ldi r25, 10
w_aussen:
        ldi r24, 50
w_innen:
        nop
        dec r24
        brne w_innen
        dec r25
        brne w_aussen
        pop r25
        pop r24
        ret
