Feature: Short-code browser encryption access
  Scenario: Grant access without copying a long secret
    Given two browsers belong to the same account and agent
    And one browser already holds the agent key
    When it enters the new browser's eight-digit code and explicitly approves
    Then only the new browser receives the existing agent key
    And Manager never receives the short code, its verifier, or a plaintext key

  Scenario: Rotate without stranding a person typing
    Given a code generation starts at time zero
    Then it accepts new handshakes before 90 seconds
    And the next generation starts at 60 seconds
    And a matched attempt has at most 30 seconds to approve
    And all deadlines are capped by the ten-minute request deadline

  Scenario: Do not trust the relay
    Given Manager substitutes an account, agent, recipient key, or handshake message
    When browsers verify the handshake and encrypted payload
    Then pairing fails without releasing the agent key

  Scenario: Bound attempts across rotation and regeneration
    Given the attempt budget is exhausted
    When a code rotates or a browser creates another request
    Then the shared account and agent budget still rejects attempts

  Scenario: Retain approved delivery
    Given approval committed but its response was lost
    When the new browser returns after the request deadline
    Then it can still retrieve and decrypt its approved key package

  Scenario: Preserve command pairing
    Given the browser selects local paxd command authorization
    Then it creates a legacy request with a high-entropy secret
    And it never substitutes an eight-digit code into the legacy commitment
