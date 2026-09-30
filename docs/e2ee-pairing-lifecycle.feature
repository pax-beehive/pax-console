Feature: Every browser pairing can finish or be replaced
  # Executed as Given/When/Then Vitest scenarios in:
  # src/features/e2ee/key-distribution-recovery.test.ts
  # src/features/e2ee/pairing-lifecycle.test.ts
  # src/features/e2ee/use-browser-pairing.test.tsx
  # src/components/e2ee/e2ee-pairing-page.test.tsx

  Scenario: Creation response is lost
    Given Manager accepted a pairing but the browser did not receive its response
    When the user creates another request
    Then a fresh pairing ID is sent
    And the old request's local recovery material remains available
    And Manager supersedes the earlier request in the same agent/device/epoch

  Scenario: Creation is definitively rejected
    Given Manager rejects creation without accepting the request
    Then only that request's local pending material is discarded
    And another request can be created

  Scenario: An abandoned request expires
    Given an unapproved request has passed its ten-minute deadline
    When the page is restored or polls its status
    Then approval waiting ends
    And another request can be created
    And its database row may remain

  Scenario: A replacement fences the old request
    Given a newer request was accepted for the same agent/device/epoch
    When the old browser request is restored
    Then the old request is not resumed as pending
    And polling of a superseded request stops

  Scenario: Approval completed while the browser was offline
    Given a matching encrypted key package was published
    When the browser returns after the original approval deadline
    Then the package is decrypted and saved
    And local pending material is removed only after saving succeeds

  Scenario: Connectivity is uncertain
    Given checking or fetching the package fails due to a network error
    Then the request is not falsely declared expired
    And recovery material remains available
    And automatic retries stop after the deadline
    And manual checks and creation of a new request remain available

  Scenario: Concurrent UI operations
    Given a poll or creation is in flight
    When the user creates a new request or selects another agent
    Then the late result cannot replace the new request or agent state
